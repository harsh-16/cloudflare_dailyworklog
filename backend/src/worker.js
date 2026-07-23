const NOTES_TOPIC_NAME = '__Daily Work Log Notes__';
const DEFAULT_ADMIN_EMAILS = 'harshr@hexaware.com,harsh.rana@corpay.com';
const DEFAULT_ALLOWED_REGISTRATION_DOMAINS = '*';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      if (request.method !== 'POST') {
        throw new HttpError(405, 'Use POST for Daily Work Log API calls.');
      }

      if (!env.DB) {
        throw new HttpError(500, 'D1 binding DB is not configured.');
      }

      const data = await request.json().catch(() => ({}));
      const action = String(data.action || '');
      const payload = data.payload && typeof data.payload === 'object' ? data.payload : {};

      if (action === 'selfRegister') {
        return json(await selfRegister(env, payload), 200, cors);
      }

      const profile = await authenticate(request, env);
      const result = await routeAction(env, profile, action, payload);
      return json(result, 200, cors);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const message = error && error.message ? error.message : 'Request failed.';
      return json({ error: message }, status, cors);
    }
  }
};

async function routeAction(env, profile, action, payload) {
  if (action === 'ping') {
    return {
      message: 'Daily Work Log API connection works.',
      now: nowIso(),
      profile: publicProfile(profile),
      is_admin: isAdminProfile(profile, env)
    };
  }

  if (action === 'listTopics') {
    return listTopics(env, profile);
  }

  if (action === 'saveTopic') {
    return saveTopic(env, profile, payload);
  }

  if (action === 'saveTopicTodos') {
    return saveTopicTodos(env, profile, payload);
  }

  if (action === 'saveTopicOrder') {
    return saveTopicOrder(env, profile, payload);
  }

  if (action === 'deleteTopic') {
    return deleteTopic(env, profile, payload);
  }

  if (action === 'listUpdates') {
    return listUpdates(env, profile, payload);
  }

  if (action === 'saveUpdate') {
    return saveUpdate(env, profile, payload);
  }

  if (action === 'deleteUpdate') {
    return deleteUpdate(env, profile, payload);
  }

  if (action === 'listThoughts') {
    return listThoughts(env, profile);
  }

  if (action === 'saveThought') {
    return saveThought(env, profile, payload);
  }

  if (action === 'deleteThought') {
    return deleteThought(env, profile, payload);
  }

  if (action === 'assistantCapture') {
    return assistantCapture(env, profile, payload);
  }

  if (action === 'assistantLookup') {
    return assistantLookup(env, profile, payload);
  }

  if (action === 'listProfiles') {
    return listProfiles(env, profile);
  }

  if (action === 'saveProfile') {
    return saveProfile(env, profile, payload);
  }

  if (action === 'createProfileApiKey') {
    return createProfileApiKey(env, profile, payload);
  }

  if (action === 'deleteProfile') {
    return deleteProfile(env, profile, payload);
  }

  if (action === 'deactivateApiKey') {
    return deactivateApiKey(env, profile, payload);
  }

  throw new HttpError(400, 'Unknown Daily Work Log action: ' + action);
}

async function authenticate(request, env) {
  const provided = String(request.headers.get('X-DWL-Key') || '').trim();

  if (!provided) {
    throw new HttpError(401, 'Daily Work Log API key is required.');
  }

  const hash = await sha256Hex(provided);
  const row = await env.DB.prepare(
    `SELECT
      k.id AS key_id,
      k.profile_id AS profile_id,
      p.name AS name,
      p.email AS email
    FROM api_keys k
    INNER JOIN profiles p ON p.id = k.profile_id
    WHERE k.key_hash = ?
      AND k.active = 1
      AND p.active = 1
      AND (k.expires_on IS NULL OR k.expires_on = '' OR k.expires_on >= ?)
    LIMIT 1`
  ).bind(hash, todayDate(env)).first();

  if (!row) {
    throw new HttpError(401, 'Invalid Daily Work Log API key.');
  }

  await env.DB.prepare('UPDATE api_keys SET last_used = ? WHERE id = ?')
    .bind(nowIso(), row.key_id)
    .run()
    .catch(() => null);

  return {
    sys_id: row.profile_id,
    name: row.name || '',
    email: row.email || ''
  };
}

async function selfRegister(env, payload) {
  const name = text(payload.u_name);
  const email = text(payload.u_email).toLowerCase();
  const label = text(payload.u_key_label) || 'Self-service browser key';

  if (!name) {
    throw new HttpError(400, 'Name is required.');
  }

  validateSelfRegistration(env, email, payload.registration_code);

  let profile = await env.DB.prepare('SELECT * FROM profiles WHERE email = ? LIMIT 1')
    .bind(email)
    .first();

  if (profile && !truthy(profile.active)) {
    throw new HttpError(403, 'This profile is inactive. Contact the Daily Work Log owner.');
  }

  if (!profile) {
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO profiles (id, name, email, active, notes, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?, ?)`
    ).bind(
      id,
      name,
      email,
      'Self-registered from the standalone Daily Work Log page.',
      nowIso(),
      nowIso()
    ).run();
    profile = await env.DB.prepare('SELECT * FROM profiles WHERE id = ?').bind(id).first();
  } else if (!profile.name) {
    await env.DB.prepare('UPDATE profiles SET name = ?, updated_at = ? WHERE id = ?')
      .bind(name, nowIso(), profile.id)
      .run();
    profile = await env.DB.prepare('SELECT * FROM profiles WHERE id = ?').bind(profile.id).first();
  }

  const plainKey = await createOnlyApiKey(env, profile.id, label, '');

  return {
    api_key: plainKey,
    profile: {
      sys_id: profile.id,
      name: profile.name || name,
      email: profile.email || email
    },
    is_admin: isAdminProfile({ email: profile.email || email }, env),
    message: 'Registration complete. Copy the API key now; it will not be shown again.'
  };
}

function validateSelfRegistration(env, email, code) {
  const expectedCode = text(env.DWL_REGISTRATION_CODE);
  const providedCode = text(code);
  const domain = String(email || '').split('@').pop().toLowerCase();
  const allowedDomains = csvSet(env.DWL_ALLOWED_REGISTRATION_DOMAINS || DEFAULT_ALLOWED_REGISTRATION_DOMAINS);

  if (!email || email.indexOf('@') < 1 || !domain) {
    throw new HttpError(400, 'Enter a valid email address.');
  }

  if (!allowedDomains.has('*') && !allowedDomains.has(domain)) {
    throw new HttpError(403, 'Registration is limited to approved email domains.');
  }

  if (expectedCode && providedCode !== expectedCode) {
    throw new HttpError(403, 'Registration code is not valid.');
  }
}

async function listTopics(env, profile) {
  const result = await env.DB.prepare(
    `SELECT *
     FROM topics
     WHERE owner_id = ? AND name <> ?
     ORDER BY active DESC,
       priority ASC,
       important DESC,
       CASE WHEN due_date = '' THEN 1 ELSE 0 END ASC,
       due_date ASC,
       name ASC`
  ).bind(profile.sys_id, NOTES_TOPIC_NAME).all();

  const rows = [];

  for (const topic of result.results || []) {
    rows.push(await topicRow(env, profile, topic));
  }

  return rows;
}

async function saveTopic(env, profile, payload) {
  const name = text(payload.u_name);

  if (!name) {
    throw new HttpError(400, 'Topic name is required.');
  }

  const existing = payload.sys_id ? await topicById(env, profile, payload.sys_id, true) : null;
  const active = payload.u_active === 'false' ? 0 : 1;
  const context = text(payload.u_context || payload.context) || existing?.context || 'Other';
  const type = text(payload.u_type || payload.type) || existing?.type || 'Technical';
  const area = text(payload.u_area);
  const dueDate = text(payload.u_due_date);
  const important = truthy(payload.u_important) ? 1 : 0;
  const priority = payload.u_priority !== undefined && payload.u_priority !== ''
    ? normalizePriority(payload.u_priority)
    : existing
      ? normalizePriority(existing.priority)
      : await nextPriority(env, profile);
  const notes = payload.u_notes === undefined && existing ? existing.notes || '' : text(payload.u_notes);

  let id = existing?.id || '';

  if (existing) {
    await env.DB.prepare(
      `UPDATE topics
       SET name = ?, context = ?, type = ?, area = ?, due_date = ?, active = ?,
         important = ?, priority = ?, notes = ?, updated_at = ?
       WHERE id = ? AND owner_id = ?`
    ).bind(name, context, type, area, dueDate, active, important, priority, notes, nowIso(), id, profile.sys_id).run();
  } else {
    id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO topics
        (id, owner_id, name, context, type, area, due_date, active, important, priority, notes, todo_items, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?)`
    ).bind(id, profile.sys_id, name, context, type, area, dueDate, active, important, priority, notes, nowIso(), nowIso()).run();
  }

  return topicRowById(env, profile, id, true);
}

async function saveTopicTodos(env, profile, payload) {
  const topic = await topicById(env, profile, payload.sys_id, false);

  if (!topic) {
    throw new HttpError(404, 'Topic was not found.');
  }

  await env.DB.prepare('UPDATE topics SET todo_items = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
    .bind(JSON.stringify(normalizeTodos(payload.todos || [])), nowIso(), topic.id, profile.sys_id)
    .run();

  return topicRowById(env, profile, topic.id, false);
}

async function saveTopicOrder(env, profile, payload) {
  const orderedTopics = Array.isArray(payload.ordered_topics) ? payload.ordered_topics : [];
  let priority = 10;

  for (const rawId of orderedTopics) {
    const id = text(rawId);
    const topic = id ? await topicById(env, profile, id, false) : null;

    if (!topic) {
      continue;
    }

    await env.DB.prepare('UPDATE topics SET priority = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
      .bind(priority, nowIso(), id, profile.sys_id)
      .run();
    priority += 10;
  }

  return listTopics(env, profile);
}

async function deleteTopic(env, profile, payload) {
  const topic = await topicById(env, profile, payload.sys_id, false);

  if (!topic) {
    throw new HttpError(404, 'Topic was not found.');
  }

  await env.DB.prepare('DELETE FROM updates WHERE owner_id = ? AND topic_id = ?')
    .bind(profile.sys_id, topic.id)
    .run();
  await env.DB.prepare('DELETE FROM topics WHERE owner_id = ? AND id = ?')
    .bind(profile.sys_id, topic.id)
    .run();

  return { deleted: true, sys_id: topic.id };
}

async function listUpdates(env, profile, payload = {}) {
  const where = ['u.owner_id = ?'];
  const params = [profile.sys_id];
  const queryText = text(payload.query).toLowerCase();
  const typeFilter = text(payload.type || payload.u_type || payload.update_type || payload.u_update_type);

  if (payload.topic) {
    const topic = await topicById(env, profile, payload.topic, false);

    if (!topic) {
      return [];
    }

    where.push('u.topic_id = ?');
    params.push(topic.id);
  }

  if (payload.status) {
    where.push('u.status = ?');
    params.push(text(payload.status));
  }

  if (typeFilter) {
    where.push('u.type = ?');
    params.push(typeFilter);
  }

  if (payload.date_from) {
    where.push('u.update_date >= ?');
    params.push(text(payload.date_from));
  }

  if (payload.date_to) {
    where.push('u.update_date <= ?');
    params.push(text(payload.date_to));
  }

  if (!truthy(payload.include_thoughts)) {
    where.push('t.name <> ?');
    params.push(NOTES_TOPIC_NAME);
  }

  const result = await env.DB.prepare(
    `SELECT
      u.*,
      t.name AS topic_name,
      t.type AS topic_type
     FROM updates u
     INNER JOIN topics t ON t.id = u.topic_id
     WHERE ${where.join(' AND ')}
     ORDER BY u.update_date DESC, u.updated_at DESC
     LIMIT 250`
  ).bind(...params).all();

  return (result.results || [])
    .map(updateRow)
    .filter((row) => !queryText || matchesUpdateQuery(row, queryText));
}

async function saveUpdate(env, profile, payload) {
  const topicId = text(payload.u_topic);
  const topic = topicId ? await topicById(env, profile, topicId, false) : null;
  const updateDate = text(payload.u_update_date) || todayDate(env);
  const focus = text(payload.u_focus);
  const progress = text(payload.u_progress);
  const blockers = text(payload.u_blockers);
  const nextStep = text(payload.u_next_step);
  const updateType = text(payload.u_type || payload.type) || topic?.type || 'Technical';

  if (!topic) {
    throw new HttpError(400, 'Topic is required.');
  }

  if (!focus && !progress && !blockers && !nextStep) {
    throw new HttpError(400, 'Add focus, progress, blockers, or next step before saving.');
  }

  let existing = payload.sys_id
    ? await updateById(env, profile, payload.sys_id)
    : await env.DB.prepare(
      'SELECT * FROM updates WHERE owner_id = ? AND topic_id = ? AND update_date = ? LIMIT 1'
    ).bind(profile.sys_id, topic.id, updateDate).first();

  let id = existing?.id || '';

  if (existing) {
    await env.DB.prepare(
      `UPDATE updates
       SET topic_id = ?, update_date = ?, focus = ?, status = ?, type = ?,
         progress = ?, blockers = ?, next_step = ?, confidence = ?, tags = ?, updated_at = ?
       WHERE id = ? AND owner_id = ?`
    ).bind(
      topic.id,
      updateDate,
      focus,
      normalizeStatus(payload.u_status),
      updateType,
      progress,
      blockers,
      nextStep,
      normalizeConfidence(payload.u_confidence),
      text(payload.u_tags),
      nowIso(),
      id,
      profile.sys_id
    ).run();
  } else {
    id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO updates
        (id, owner_id, topic_id, update_date, focus, status, type, progress, blockers, next_step, confidence, tags, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      profile.sys_id,
      topic.id,
      updateDate,
      focus,
      normalizeStatus(payload.u_status),
      updateType,
      progress,
      blockers,
      nextStep,
      normalizeConfidence(payload.u_confidence),
      text(payload.u_tags),
      nowIso(),
      nowIso()
    ).run();
  }

  const row = await updateById(env, profile, id);
  return updateRow({ ...row, topic_name: topic.name, topic_type: topic.type });
}

async function deleteUpdate(env, profile, payload) {
  const update = await updateById(env, profile, payload.sys_id);

  if (!update) {
    throw new HttpError(404, 'Update was not found.');
  }

  await env.DB.prepare('DELETE FROM updates WHERE id = ? AND owner_id = ?')
    .bind(update.id, profile.sys_id)
    .run();

  return { deleted: true, sys_id: update.id };
}

async function listThoughts(env, profile) {
  const notesTopic = await notesTopicId(env, profile, true);
  const result = await env.DB.prepare(
    `SELECT *
     FROM updates
     WHERE owner_id = ? AND topic_id = ?
     ORDER BY update_date DESC, updated_at DESC
     LIMIT 250`
  ).bind(profile.sys_id, notesTopic).all();

  return (result.results || []).map(thoughtRow);
}

async function saveThought(env, profile, payload) {
  const title = text(payload.u_title);
  const note = text(payload.u_note);
  const tags = text(payload.u_tags);
  const noteDate = text(payload.u_note_date) || todayDate(env);
  const notesTopic = await notesTopicId(env, profile, true);

  if (!title && !note) {
    throw new HttpError(400, 'Add a title or note before saving.');
  }

  let existing = payload.sys_id ? await updateById(env, profile, payload.sys_id) : null;

  if (existing && existing.topic_id !== notesTopic) {
    throw new HttpError(400, 'This record is not a thought.');
  }

  let id = existing?.id || '';

  if (existing) {
    await env.DB.prepare(
      `UPDATE updates
       SET topic_id = ?, update_date = ?, focus = ?, status = ?, type = 'Admin',
         progress = ?, blockers = '', next_step = '', confidence = 100, tags = ?, updated_at = ?
       WHERE id = ? AND owner_id = ?`
    ).bind(notesTopic, noteDate, title || 'Thought', truthy(payload.u_important) ? 'watching' : 'on_track', note, tags, nowIso(), id, profile.sys_id).run();
  } else {
    id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO updates
        (id, owner_id, topic_id, update_date, focus, status, type, progress, blockers, next_step, confidence, tags, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'Admin', ?, '', '', 100, ?, ?, ?)`
    ).bind(id, profile.sys_id, notesTopic, noteDate, title || 'Thought', truthy(payload.u_important) ? 'watching' : 'on_track', note, tags, nowIso(), nowIso()).run();
  }

  const row = await updateById(env, profile, id);
  return thoughtRow(row);
}

async function deleteThought(env, profile, payload) {
  const notesTopic = await notesTopicId(env, profile, false);
  const update = await updateById(env, profile, payload.sys_id);

  if (!update) {
    throw new HttpError(404, 'Thought was not found.');
  }

  if (notesTopic && update.topic_id !== notesTopic) {
    throw new HttpError(400, 'This record is not a thought.');
  }

  await env.DB.prepare('DELETE FROM updates WHERE id = ? AND owner_id = ?')
    .bind(update.id, profile.sys_id)
    .run();

  return { deleted: true, sys_id: update.id };
}

async function assistantCapture(env, profile, payload) {
  const topic = await assistantFindOrCreateTopic(env, profile, payload);
  const updatePayload = {
    u_topic: topic.sys_id,
    u_update_date: text(payload.date || payload.u_update_date) || todayDate(env),
    u_focus: text(payload.focus || payload.u_focus || payload.summary),
    u_status: normalizeStatus(payload.status || payload.u_status),
    u_type: text(payload.update_type || payload.u_update_type || payload.type || payload.u_type) || topic.u_type || 'Technical',
    u_progress: stringFromList(payload.progress || payload.u_progress || payload.notes || payload.raw_notes),
    u_blockers: stringFromList(payload.blockers || payload.u_blockers),
    u_next_step: stringFromList(payload.next_step || payload.next_steps || payload.u_next_step),
    u_confidence: normalizeConfidence(payload.confidence || payload.u_confidence || '70'),
    u_tags: assistantTags(payload.tags)
  };
  const hasUpdateContent = updatePayload.u_focus || updatePayload.u_progress || updatePayload.u_blockers || updatePayload.u_next_step;
  let update = null;
  let thought = null;

  if (!updatePayload.u_focus) {
    updatePayload.u_focus = updatePayload.u_progress ? firstLine(updatePayload.u_progress) : 'Assistant capture';
  }

  if (hasUpdateContent) {
    update = await saveUpdate(env, profile, updatePayload);
  }

  const todosAdded = await assistantMergeTodos(env, profile, topic.sys_id, payload.todo_items || payload.todos || payload.to_dos || []);

  if (payload.note || payload.thought || payload.important_note) {
    thought = await saveThought(env, profile, {
      u_note_date: text(payload.date || payload.u_update_date) || todayDate(env),
      u_title: text(payload.note_title || payload.thought_title) || 'Assistant note',
      u_note: stringFromList(payload.note || payload.thought || payload.important_note),
      u_tags: assistantTags(payload.note_tags || payload.tags),
      u_important: truthy(payload.note_important || payload.important_note) ? 'true' : 'false'
    });
  }

  return {
    message: 'Assistant capture saved.',
    topic,
    update,
    thought,
    todos_added: todosAdded
  };
}

async function assistantLookup(env, profile, payload) {
  const queryText = text(payload.query || payload.search).toLowerCase();
  const topicId = text(payload.topic_id) || await topicIdByName(env, profile, payload.topic || payload.topic_name);
  const mode = text(payload.mode).toLowerCase() || 'summary';
  const context = text(payload.context || payload.u_context);
  const type = text(payload.type || payload.u_type);
  let topics = await listTopics(env, profile);
  let updates = await listUpdates(env, profile, {
    topic: topicId,
    status: payload.status || '',
    date_from: payload.date_from || '',
    date_to: payload.date_to || '',
    query: queryText
  });
  let thoughts = truthy(payload.include_notes) || mode === 'notes' || mode === 'summary'
    ? await listThoughts(env, profile)
    : [];

  if (queryText) {
    topics = topics.filter((topic) => topicMatchesQuery(topic, queryText));
    thoughts = thoughts.filter((thought) => thoughtMatchesQuery(thought, queryText));
  }

  if (context) {
    topics = topics.filter((topic) => String(topic.u_context || 'Other') === context);
  }

  if (type) {
    topics = topics.filter((topic) => String(topic.u_type || 'Technical') === type);
  }

  if (context || type) {
    const allowedTopicIds = new Set(topics.map((topic) => topic.sys_id));
    updates = updates.filter((update) => allowedTopicIds.has(update.u_topic && update.u_topic.value));
  }

  if (topicId) {
    topics = topics.filter((topic) => topic.sys_id === topicId);
  }

  if (payload.date_from || payload.date_to) {
    thoughts = thoughts.filter((thought) => dateInRange(thought.u_note_date, text(payload.date_from), text(payload.date_to)));
  }

  return {
    message: 'Daily Work Log lookup complete.',
    mode,
    query: queryText,
    topics: topics.slice(0, limitNumber(payload.limit_topics, 20)),
    updates: updates.slice(0, limitNumber(payload.limit_updates, 30)),
    thoughts: thoughts.slice(0, limitNumber(payload.limit_notes, 20)),
    summary: lookupSummary(topics, updates, thoughts)
  };
}

async function assistantFindOrCreateTopic(env, profile, payload) {
  const topicSysId = text(payload.topic_id || payload.u_topic);
  const topicName = text(payload.topic || payload.topic_name || payload.u_topic_name);

  if (topicSysId) {
    const existing = await topicById(env, profile, topicSysId, false);

    if (!existing) {
      throw new HttpError(404, 'Topic was not found.');
    }

    await assistantUpdateTopicMetadata(env, profile, existing, payload);
    return topicRowById(env, profile, existing.id, false);
  }

  if (!topicName) {
    throw new HttpError(400, 'Topic name is required for assistant capture.');
  }

  const existing = await env.DB.prepare(
    'SELECT * FROM topics WHERE owner_id = ? AND lower(name) = lower(?) AND name <> ? LIMIT 1'
  ).bind(profile.sys_id, topicName, NOTES_TOPIC_NAME).first();

  if (existing) {
    await assistantUpdateTopicMetadata(env, profile, existing, payload);
    return topicRowById(env, profile, existing.id, false);
  }

  return saveTopic(env, profile, {
    u_name: topicName,
    u_context: text(payload.context || payload.u_context) || 'Other',
    u_type: text(payload.type || payload.u_type || topicTypeFromPayload(payload)) || 'Technical',
    u_area: text(payload.area || payload.u_area),
    u_due_date: text(payload.due_date || payload.u_due_date),
    u_active: 'true',
    u_important: truthy(payload.important || payload.u_important) ? 'true' : 'false',
    u_notes: text(payload.topic_notes || payload.u_notes)
  });
}

async function assistantUpdateTopicMetadata(env, profile, topic, payload) {
  const changes = {
    name: topic.name,
    context: topic.context,
    type: topic.type,
    area: topic.area,
    due_date: topic.due_date,
    active: topic.active,
    important: topic.important,
    priority: topic.priority,
    notes: topic.notes
  };
  let changed = false;

  if (payload.area || payload.u_area) {
    changes.area = text(payload.area || payload.u_area);
    changed = true;
  }

  if (payload.due_date || payload.u_due_date) {
    changes.due_date = text(payload.due_date || payload.u_due_date);
    changed = true;
  }

  if (payload.context || payload.u_context) {
    changes.context = text(payload.context || payload.u_context) || 'Other';
    changed = true;
  }

  if (payload.type || payload.u_type || payload.meeting === true) {
    changes.type = text(payload.type || payload.u_type || topicTypeFromPayload(payload)) || 'Technical';
    changed = true;
  }

  if (payload.important !== undefined || payload.u_important !== undefined) {
    changes.important = truthy(payload.important || payload.u_important) ? 1 : 0;
    changed = true;
  }

  if (payload.topic_notes || payload.u_notes) {
    changes.notes = text(payload.topic_notes || payload.u_notes);
    changed = true;
  }

  if (!changed) {
    return;
  }

  await env.DB.prepare(
    `UPDATE topics
     SET context = ?, type = ?, area = ?, due_date = ?, important = ?, notes = ?, updated_at = ?
     WHERE id = ? AND owner_id = ?`
  ).bind(changes.context, changes.type, changes.area, changes.due_date, changes.important, changes.notes, nowIso(), topic.id, profile.sys_id).run();
}

async function assistantMergeTodos(env, profile, topicSysId, todos) {
  const incoming = normalizeAssistantTodos(todos);

  if (!incoming.length) {
    return 0;
  }

  const topic = await topicById(env, profile, topicSysId, false);

  if (!topic) {
    throw new HttpError(404, 'Topic was not found.');
  }

  const existing = normalizeTodos(parseJsonArray(topic.todo_items || '[]'));
  const seen = new Set(existing.map((item) => String(item.text || '').toLowerCase()));
  let added = 0;

  for (const item of incoming) {
    if (seen.has(item.text.toLowerCase())) {
      continue;
    }

    existing.push(item);
    seen.add(item.text.toLowerCase());
    added += 1;
  }

  if (added) {
    await env.DB.prepare('UPDATE topics SET todo_items = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
      .bind(JSON.stringify(normalizeTodos(existing)), nowIso(), topic.id, profile.sys_id)
      .run();
  }

  return added;
}

async function listProfiles(env, profile) {
  requireAdmin(profile, env);

  const result = await env.DB.prepare('SELECT * FROM profiles ORDER BY name ASC').all();
  const rows = [];

  for (const row of result.results || []) {
    rows.push(await profileRow(env, row));
  }

  return rows;
}

async function saveProfile(env, profile, payload) {
  requireAdmin(profile, env);

  const name = text(payload.u_name);
  const email = text(payload.u_email).toLowerCase();
  const notes = text(payload.u_notes);
  const active = payload.u_active === 'false' ? 0 : 1;

  if (!name) {
    throw new HttpError(400, 'Profile name is required.');
  }

  if (!email) {
    throw new HttpError(400, 'Profile email is required.');
  }

  let existing = payload.sys_id
    ? await env.DB.prepare('SELECT * FROM profiles WHERE id = ? LIMIT 1').bind(text(payload.sys_id)).first()
    : await env.DB.prepare('SELECT * FROM profiles WHERE email = ? LIMIT 1').bind(email).first();

  let id = existing?.id || '';

  if (existing) {
    await env.DB.prepare('UPDATE profiles SET name = ?, email = ?, active = ?, notes = ?, updated_at = ? WHERE id = ?')
      .bind(name, email, active, notes, nowIso(), id)
      .run();
  } else {
    id = crypto.randomUUID();
    await env.DB.prepare(
      'INSERT INTO profiles (id, name, email, active, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, name, email, active, notes, nowIso(), nowIso()).run();
  }

  const row = await env.DB.prepare('SELECT * FROM profiles WHERE id = ?').bind(id).first();
  return profileRow(env, row);
}

async function createProfileApiKey(env, profile, payload) {
  requireAdmin(profile, env);

  const profileSysId = text(payload.profile_sys_id);

  if (!profileSysId) {
    throw new HttpError(400, 'Profile sys_id is required.');
  }

  const targetProfile = await env.DB.prepare('SELECT * FROM profiles WHERE id = ? LIMIT 1')
    .bind(profileSysId)
    .first();

  if (!targetProfile) {
    throw new HttpError(404, 'Profile was not found.');
  }

  const plainKey = await createOnlyApiKey(env, targetProfile.id, text(payload.u_key_label) || 'Standalone page key', text(payload.u_expires_on));
  const keyHash = await sha256Hex(plainKey);
  const key = await env.DB.prepare('SELECT * FROM api_keys WHERE key_hash = ? LIMIT 1')
    .bind(keyHash)
    .first();

  return {
    api_key: plainKey,
    key: apiKeyRow(key)
  };
}

async function deleteProfile(env, profile, payload) {
  requireAdmin(profile, env);

  const profileSysId = text(payload.sys_id);

  if (!profileSysId) {
    throw new HttpError(400, 'Profile sys_id is required.');
  }

  if (profile.sys_id === profileSysId) {
    throw new HttpError(400, 'You cannot remove the profile currently used by this admin session.');
  }

  const targetProfile = await env.DB.prepare('SELECT * FROM profiles WHERE id = ? LIMIT 1')
    .bind(profileSysId)
    .first();

  if (!targetProfile) {
    throw new HttpError(404, 'Profile was not found.');
  }

  await env.DB.prepare('DELETE FROM api_keys WHERE profile_id = ?').bind(profileSysId).run();
  await env.DB.prepare('DELETE FROM updates WHERE owner_id = ?').bind(profileSysId).run();
  await env.DB.prepare('DELETE FROM topics WHERE owner_id = ?').bind(profileSysId).run();
  await env.DB.prepare('DELETE FROM profiles WHERE id = ?').bind(profileSysId).run();

  return { deleted: true, sys_id: profileSysId };
}

async function deactivateApiKey(env, profile, payload) {
  requireAdmin(profile, env);

  const keyId = text(payload.sys_id);

  if (!keyId) {
    throw new HttpError(400, 'API key sys_id is required.');
  }

  const key = await env.DB.prepare('SELECT * FROM api_keys WHERE id = ? LIMIT 1')
    .bind(keyId)
    .first();

  if (!key) {
    throw new HttpError(404, 'API key was not found.');
  }

  await env.DB.prepare('UPDATE api_keys SET active = 0 WHERE id = ?').bind(keyId).run();
  return apiKeyRow({ ...key, active: 0 });
}

async function createOnlyApiKey(env, profileSysId, label, expiresOn) {
  const plainKey = randomApiKey();
  const keyHash = await sha256Hex(plainKey);
  const keyId = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO api_keys (id, profile_id, key_label, key_hash, active, expires_on, created_at)
     VALUES (?, ?, ?, ?, 1, ?, ?)`
  ).bind(keyId, profileSysId, label, keyHash, expiresOn || '', nowIso()).run();

  await env.DB.prepare('DELETE FROM api_keys WHERE profile_id = ? AND id <> ?')
    .bind(profileSysId, keyId)
    .run();

  return plainKey;
}

async function profileRow(env, row) {
  return {
    sys_id: row.id,
    u_name: row.name || '',
    u_email: row.email || '',
    u_active: truthy(row.active) ? 'true' : 'false',
    u_notes: row.notes || '',
    is_admin: isAdminProfile({ email: row.email }, env),
    api_keys: await apiKeysForProfile(env, row.id)
  };
}

async function apiKeysForProfile(env, profileSysId) {
  const result = await env.DB.prepare('SELECT * FROM api_keys WHERE profile_id = ? ORDER BY created_at DESC')
    .bind(profileSysId)
    .all();

  return (result.results || []).map(apiKeyRow);
}

function apiKeyRow(row) {
  return {
    sys_id: row.id,
    u_key_label: row.key_label || '',
    u_active: truthy(row.active) ? 'true' : 'false',
    u_expires_on: row.expires_on || '',
    u_last_used: row.last_used || '',
    sys_created_on: row.created_at || ''
  };
}

async function topicRowById(env, profile, topicId, allowNotes) {
  const topic = await topicById(env, profile, topicId, allowNotes);

  if (!topic) {
    throw new HttpError(404, 'Topic was not found.');
  }

  return topicRow(env, profile, topic);
}

async function topicRow(env, profile, topic) {
  const stats = await topicStats(env, profile, topic.id);

  return {
    sys_id: topic.id,
    u_name: topic.name || '',
    u_context: topic.context || 'Other',
    u_type: topic.type || 'Technical',
    u_area: topic.area || '',
    u_active: truthy(topic.active) ? 'true' : 'false',
    u_important: truthy(topic.important) ? 'true' : 'false',
    u_priority: String(topic.priority ?? 10000),
    u_todo_items: topic.todo_items || '[]',
    u_due_date: topic.due_date || '',
    u_notes: topic.notes || '',
    update_count: stats.count,
    latest_update_date: stats.latestDate,
    latest_status: stats.latestStatus,
    latest_focus: stats.latestFocus,
    latest_confidence: stats.latestConfidence
  };
}

async function topicStats(env, profile, topicId) {
  const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM updates WHERE owner_id = ? AND topic_id = ?')
    .bind(profile.sys_id, topicId)
    .first();
  const latest = await env.DB.prepare(
    `SELECT update_date, status, focus, confidence
     FROM updates
     WHERE owner_id = ? AND topic_id = ?
     ORDER BY update_date DESC, updated_at DESC
     LIMIT 1`
  ).bind(profile.sys_id, topicId).first();

  return {
    count: Number(count?.count || 0),
    latestDate: latest?.update_date || '',
    latestStatus: latest?.status || '',
    latestFocus: latest?.focus || '',
    latestConfidence: latest?.confidence !== undefined && latest?.confidence !== null ? String(latest.confidence) : ''
  };
}

function updateRow(row) {
  return {
    sys_id: row.id,
    u_topic: {
      value: row.topic_id || '',
      display_value: row.topic_name || ''
    },
    u_update_date: row.update_date || '',
    u_focus: row.focus || '',
    u_status: row.status || 'on_track',
    u_type: row.type || row.topic_type || 'Technical',
    u_progress: row.progress || '',
    u_blockers: row.blockers || '',
    u_next_step: row.next_step || '',
    u_confidence: row.confidence !== undefined && row.confidence !== null ? String(row.confidence) : '70',
    u_tags: row.tags || '',
    sys_updated_on: row.updated_at || ''
  };
}

function thoughtRow(row) {
  return {
    sys_id: row.id,
    u_title: row.focus || '',
    u_note: row.progress || '',
    u_note_date: row.update_date || '',
    u_important: row.status === 'watching' ? 'true' : 'false',
    u_tags: row.tags || '',
    sys_updated_on: row.updated_at || ''
  };
}

async function topicById(env, profile, topicId, allowNotes) {
  const id = text(topicId);

  if (!id) {
    return null;
  }

  const topic = await env.DB.prepare('SELECT * FROM topics WHERE id = ? AND owner_id = ? LIMIT 1')
    .bind(id, profile.sys_id)
    .first();

  if (!topic) {
    return null;
  }

  if (!allowNotes && topic.name === NOTES_TOPIC_NAME) {
    return null;
  }

  return topic;
}

async function updateById(env, profile, updateId) {
  const id = text(updateId);

  if (!id) {
    return null;
  }

  return env.DB.prepare(
    `SELECT
      u.*,
      t.name AS topic_name,
      t.type AS topic_type
     FROM updates u
     LEFT JOIN topics t ON t.id = u.topic_id
     WHERE u.id = ? AND u.owner_id = ?
     LIMIT 1`
  ).bind(id, profile.sys_id).first();
}

async function notesTopicId(env, profile, createIfMissing) {
  const existing = await env.DB.prepare('SELECT * FROM topics WHERE owner_id = ? AND name = ? LIMIT 1')
    .bind(profile.sys_id, NOTES_TOPIC_NAME)
    .first();

  if (existing) {
    return existing.id;
  }

  if (!createIfMissing) {
    return '';
  }

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO topics
      (id, owner_id, name, context, type, area, due_date, active, important, priority, notes, todo_items, created_at, updated_at)
     VALUES (?, ?, ?, 'Other', 'Admin', 'Notes', '', 0, 0, 99999, ?, '[]', ?, ?)`
  ).bind(id, profile.sys_id, NOTES_TOPIC_NAME, 'System topic used by the standalone Notes tab.', nowIso(), nowIso()).run();

  return id;
}

async function nextPriority(env, profile) {
  const row = await env.DB.prepare('SELECT MAX(priority) AS max_priority FROM topics WHERE owner_id = ? AND name <> ?')
    .bind(profile.sys_id, NOTES_TOPIC_NAME)
    .first();
  const current = Number(row?.max_priority || 0);
  return current + 10;
}

async function topicIdByName(env, profile, name) {
  const topicName = text(name);

  if (!topicName) {
    return '';
  }

  const row = await env.DB.prepare(
    'SELECT id FROM topics WHERE owner_id = ? AND lower(name) = lower(?) AND name <> ? LIMIT 1'
  ).bind(profile.sys_id, topicName, NOTES_TOPIC_NAME).first();

  return row?.id || '';
}

function matchesUpdateQuery(row, queryText) {
  return [
    row.u_topic.display_value,
    row.u_update_date,
    row.u_focus,
    row.u_status,
    row.u_type,
    row.u_progress,
    row.u_blockers,
    row.u_next_step,
    row.u_confidence,
    row.u_tags
  ].join(' ').toLowerCase().indexOf(queryText) > -1;
}

function topicMatchesQuery(topic, queryText) {
  return [
    topic.u_name,
    topic.u_context,
    topic.u_type,
    topic.u_area,
    topic.u_notes,
    topic.u_due_date,
    topic.latest_status,
    topic.latest_focus,
    topic.u_todo_items
  ].join(' ').toLowerCase().indexOf(queryText) > -1;
}

function thoughtMatchesQuery(thought, queryText) {
  return [
    thought.u_title,
    thought.u_note,
    thought.u_note_date,
    thought.u_tags
  ].join(' ').toLowerCase().indexOf(queryText) > -1;
}

function lookupSummary(topics, updates, thoughts) {
  let blocked = 0;
  let watching = 0;
  let complete = 0;

  for (const update of updates) {
    if (update.u_status === 'blocked') {
      blocked += 1;
    } else if (update.u_status === 'watching') {
      watching += 1;
    } else if (update.u_status === 'complete') {
      complete += 1;
    }
  }

  return {
    topic_count: topics.length,
    update_count: updates.length,
    note_count: thoughts.length,
    blocked_update_count: blocked,
    watching_update_count: watching,
    complete_update_count: complete
  };
}

function requireAdmin(profile, env) {
  if (!isAdminProfile(profile, env)) {
    throw new HttpError(403, 'User management requires a Daily Work Log admin API key.');
  }
}

function isAdminProfile(profile, env) {
  const email = String(profile && profile.email || '').toLowerCase();
  return !!email && adminEmailSet(env).has(email);
}

function adminEmailSet(env) {
  return csvSet(env.DWL_ADMIN_EMAILS || DEFAULT_ADMIN_EMAILS);
}

function publicProfile(profile) {
  return {
    sys_id: profile.sys_id,
    name: profile.name || '',
    email: profile.email || '',
    is_admin: false
  };
}

function normalizePriority(value) {
  const priority = parseInt(value, 10);
  return Number.isNaN(priority) || priority < 0 ? 10000 : priority;
}

function normalizeConfidence(value) {
  const number = parseInt(value, 10);

  if (Number.isNaN(number)) {
    return 70;
  }

  if (number < 0) {
    return 0;
  }

  if (number > 100) {
    return 100;
  }

  return number;
}

function normalizeStatus(status) {
  const value = String(status || 'on_track').toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
  const allowed = new Set(['on_track', 'watching', 'blocked', 'paused', 'complete']);
  return allowed.has(value) ? value : 'on_track';
}

function normalizeTodos(todos) {
  if (!Array.isArray(todos)) {
    return [];
  }

  const normalized = [];

  for (const item of todos) {
    let textValue = text(item && item.text);

    if (!textValue) {
      continue;
    }

    if (textValue.length > 160) {
      textValue = textValue.substring(0, 160);
    }

    normalized.push({
      text: textValue,
      done: truthy(item && item.done)
    });

    if (normalized.length >= 50) {
      break;
    }
  }

  return normalized;
}

function normalizeAssistantTodos(todos) {
  let values = todos;

  if (typeof values === 'string') {
    values = values.split(/\n|;/);
  }

  if (!Array.isArray(values)) {
    return [];
  }

  const normalized = [];

  for (const item of values) {
    let textValue = typeof item === 'string'
      ? item
      : item && (item.text || item.title || item.name);

    textValue = text(textValue).replace(/^[-*]\s*/, '');

    if (!textValue) {
      continue;
    }

    normalized.push({
      text: textValue.length > 160 ? textValue.substring(0, 160) : textValue,
      done: false
    });

    if (normalized.length >= 20) {
      break;
    }
  }

  return normalized;
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function stringFromList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => text(item)).filter(Boolean).join('\n');
  }

  return text(value);
}

function assistantTags(tags) {
  let values = [];

  if (Array.isArray(tags)) {
    values = tags.map((tag) => text(tag)).filter(Boolean);
  } else if (tags) {
    values = String(tags).split(',').map((tag) => text(tag)).filter(Boolean);
  }

  if (values.join(',').toLowerCase().indexOf('assistant') === -1) {
    values.push('assistant');
  }

  return values.join(', ');
}

function topicTypeFromPayload(payload) {
  if (truthy(payload.meeting) || truthy(payload.is_meeting)) {
    return 'Meeting';
  }

  if (truthy(payload.research) || truthy(payload.self_research)) {
    return 'Self Research';
  }

  return 'Technical';
}

function dateInRange(dateValue, dateFrom, dateTo) {
  const value = text(dateValue);

  if (!value) {
    return false;
  }

  if (dateFrom && value < dateFrom) {
    return false;
  }

  if (dateTo && value > dateTo) {
    return false;
  }

  return true;
}

function limitNumber(value, fallback) {
  const number = parseInt(value, 10);

  if (Number.isNaN(number) || number < 1) {
    return fallback;
  }

  return number > 100 ? 100 : number;
}

function firstLine(value) {
  return text(value).split('\n')[0].substring(0, 100);
}

function truthy(value) {
  return value === true ||
    value === 1 ||
    String(value).toLowerCase() === 'true' ||
    String(value) === '1' ||
    String(value).toLowerCase() === 'yes';
}

function text(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

function csvSet(value) {
  return new Set(String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean));
}

function todayDate(env) {
  const zone = env.DWL_TIME_ZONE || 'America/New_York';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const lookup = {};

  for (const part of parts) {
    lookup[part.type] = part.value;
  }

  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

function nowIso() {
  return new Date().toISOString();
}

function randomApiKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return 'dwl_' + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256Hex(value) {
  const data = new TextEncoder().encode(String(value || ''));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function corsHeaders(request, env) {
  const allowed = String(env.DWL_ALLOWED_ORIGINS || '*');
  const origin = request.headers.get('Origin') || '';
  let allowOrigin = '*';

  if (allowed !== '*') {
    const origins = allowed.split(',').map((item) => item.trim()).filter(Boolean);
    allowOrigin = origins.includes(origin) ? origin : origins[0] || '*';
  }

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-DWL-Key',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json; charset=utf-8'
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers
  });
}
