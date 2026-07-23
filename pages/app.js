(function() {
  'use strict';

  var STORAGE_KEY = 'dailyWorkLogConnection';
  var SELECTED_TOPIC_KEY = 'dailyWorkLogSelectedTopic';
  var PENDING_UPDATE_DATE_KEY = 'dailyWorkLogPendingUpdateDate';
  var PENDING_UPDATE_ID_KEY = 'dailyWorkLogPendingUpdateId';
  var PENDING_AI_DRAFT_KEY = 'dailyWorkLogPendingAiDraft';
  var PENDING_TOPIC_FILTER_KEY = 'dailyWorkLogPendingTopicFilter';
  var PENDING_UPDATE_FILTER_KEY = 'dailyWorkLogPendingUpdateFilter';
  var COMMAND_FILTER_KEY = 'dailyWorkLogCommandFilter';
  var DEFAULT_INSTANCE = 'https://dailyworklog-api.harsh16.workers.dev';
  var DEFAULT_API_PATH = '/rpc';
  var PAGE_PATHS = {
    home: 'x_552119_daily_w_0_daily_work_log_standalone_home.do',
    workspace: 'x_552119_daily_w_0_daily_work_log_standalone_workspace.do',
    topics: 'x_552119_daily_w_0_daily_work_log_standalone_topics.do',
    updates: 'x_552119_daily_w_0_daily_work_log_standalone_updates.do',
    notes: 'x_552119_daily_w_0_daily_work_log_standalone_notes.do',
    ai: 'x_552119_daily_w_0_daily_work_log_standalone_ai.do',
    users: 'x_552119_daily_w_0_daily_work_log_standalone_users.do',
    connection: 'x_552119_daily_w_0_daily_work_log_standalone_connection.do'
  };
  var PAGES = ['home', 'workspace', 'topics', 'updates', 'notes', 'ai', 'users', 'connection'];
  var topicContextOptions = ['Corpay', 'KPMG', 'Personal', 'Other'];
  var topicTypeOptions = ['Technical', 'Meeting', 'Self Research', 'Admin', 'Follow-up', 'Learning'];
  var state = {
    page: currentPageName(),
    topics: [],
    updates: [],
    thoughts: [],
    profiles: [],
    selectedTopic: sessionValue(SELECTED_TOPIC_KEY),
    topicEditId: '',
    topicEditMode: false,
    thoughtEditId: '',
    profileEditId: '',
    generatedApiKey: null,
    registrationApiKey: null,
    dragTopicId: '',
    globalSearch: '',
    aiHelperMode: 'meeting',
    commandFilter: sessionJson(COMMAND_FILTER_KEY) || { context: '', type: '' },
    connection: loadConnection()
  };

  var statusLabels = {
    on_track: 'On track',
    watching: 'Watching',
    blocked: 'Blocked',
    paused: 'Paused',
    complete: 'Complete'
  };

  var noteTypeLabels = {
    thought: 'Thought',
    idea: 'Idea',
    decision: 'Decision',
    reminder: 'Reminder',
    risk: 'Risk'
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function sessionValue(key) {
    try {
      return sessionStorage.getItem(key) || '';
    } catch (error) {
      return '';
    }
  }

  function setSessionValue(key, value) {
    try {
      if (value) {
        sessionStorage.setItem(key, value);
      } else {
        sessionStorage.removeItem(key);
      }
    } catch (error) {}
  }

  function sessionJson(key) {
    try {
      return JSON.parse(sessionStorage.getItem(key) || 'null') || null;
    } catch (error) {
      return null;
    }
  }

  function setSessionJson(key, value) {
    try {
      if (value) {
        sessionStorage.setItem(key, JSON.stringify(value));
      } else {
        sessionStorage.removeItem(key);
      }
    } catch (error) {}
  }

  function currentPageName() {
    var shell = document.querySelector('[data-du-page]');
    var page = shell ? shell.getAttribute('data-du-page') : '';
    return PAGE_PATHS[page] ? page : 'home';
  }

  function hasPage(page) {
    return !!byId('du-page-' + page);
  }

  function pageUrl(page) {
    return location.origin + '/' + PAGE_PATHS[page];
  }

  function saveSelectedTopic(topicId) {
    state.selectedTopic = topicId || '';
    setSessionValue(SELECTED_TOPIC_KEY, state.selectedTopic);
  }

  function goToPage(page) {
    if (!PAGE_PATHS[page]) {
      return;
    }

    if (hasPage(page)) {
      state.page = page;
      renderPage();
      return;
    }

    window.location.href = pageUrl(page);
  }

  function on(id, eventName, handler) {
    var element = byId(id);

    if (element) {
      element.addEventListener(eventName, handler);
    }
  }

  function loadConnection() {
    var fallback = {
      instanceUrl: location.protocol.indexOf('http') === 0 && location.hostname.indexOf('service-now.com') > -1 ? location.origin : DEFAULT_INSTANCE,
      apiPath: DEFAULT_API_PATH,
      apiKey: '',
      profile: null,
      isAdmin: false
    };

    try {
      return Object.assign(fallback, JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
    } catch (error) {
      return fallback;
    }
  }

  function saveConnection(connection) {
    state.connection = {
      instanceUrl: normalizeInstanceUrl(connection.instanceUrl),
      apiPath: normalizeApiPath(connection.apiPath),
      apiKey: String(connection.apiKey || '').trim(),
      profile: normalizeProfile(connection.profile || state.connection.profile),
      isAdmin: connection.isAdmin === true || connection.isAdmin === 'true'
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.connection));
    renderConnectionState();
  }

  function clearConnection() {
    localStorage.removeItem(STORAGE_KEY);
    state.connection = {
      instanceUrl: DEFAULT_INSTANCE,
      apiPath: DEFAULT_API_PATH,
      apiKey: '',
      profile: null,
      isAdmin: false
    };
    renderConnectionState();
  }

  function normalizeProfile(profile) {
    if (!profile || typeof profile !== 'object') {
      return null;
    }

    return {
      sys_id: String(profile.sys_id || ''),
      name: String(profile.name || ''),
      email: String(profile.email || ''),
      is_admin: profile.is_admin === true || profile.is_admin === 'true'
    };
  }

  function connectionFromForm(profile, isAdmin) {
    return {
      instanceUrl: byId('du-instance-url').value,
      apiPath: byId('du-api-path').value,
      apiKey: byId('du-api-key').value,
      profile: profile || null,
      isAdmin: isAdmin === true
    };
  }

  function normalizeInstanceUrl(url) {
    return String(url || '').trim().replace(/\/+$/, '');
  }

  function normalizeApiPath(path) {
    path = String(path || DEFAULT_API_PATH).trim();

    if (path.charAt(0) !== '/') {
      path = '/' + path;
    }

    return path;
  }

  function endpoint() {
    return normalizeInstanceUrl(state.connection.instanceUrl) + normalizeApiPath(state.connection.apiPath);
  }

  function valueOf(field) {
    if (field && typeof field === 'object') {
      return field.value || '';
    }

    return field || '';
  }

  function displayOf(field) {
    if (field && typeof field === 'object') {
      return field.display_value || field.value || '';
    }

    return field || '';
  }

  function isActive(topic) {
    var value = valueOf(topic.u_active);
    return value === true || String(value).toLowerCase() === 'true' || String(value) === '1' || String(value).toLowerCase() === 'yes';
  }

  function isImportant(topic) {
    var value = valueOf(topic.u_important);
    return value === true || String(value).toLowerCase() === 'true' || String(value) === '1' || String(value).toLowerCase() === 'yes';
  }

  function topicContext(topic) {
    var value = displayOf(topic && topic.u_context);
    return value || 'Other';
  }

  function topicType(topic) {
    var value = displayOf(topic && topic.u_type);
    return value || 'Technical';
  }

  function updateType(update) {
    var value = displayOf(update && update.u_type);
    var topic;

    if (value) {
      return value;
    }

    topic = update ? topicById(valueOf(update.u_topic)) : null;
    return topic ? topicType(topic) : 'Technical';
  }

  function priorityOf(topic) {
    var priority = parseInt(valueOf(topic.u_priority), 10);
    return isNaN(priority) ? 10000 : priority;
  }

  function todosOf(topic) {
    var raw = valueOf(topic.u_todo_items) || '[]';

    try {
      var parsed = JSON.parse(raw);

      if (Object.prototype.toString.call(parsed) === '[object Array]') {
        return parsed.filter(function(item) {
          return item && String(item.text || '').trim();
        }).map(function(item) {
          return {
            text: String(item.text || '').trim(),
            done: item.done === true || String(item.done).toLowerCase() === 'true' || String(item.done) === '1'
          };
        });
      }
    } catch (error) {
      return [];
    }

    return [];
  }

  function todoSummary(topic) {
    var todos = todosOf(topic);
    var done = todos.filter(function(item) {
      return item.done;
    }).length;

    if (!todos.length) {
      return 'No to-dos';
    }

    return done + '/' + todos.length + ' done';
  }

  function sortTopics(topics) {
    return topics.slice().sort(function(a, b) {
      return priorityOf(a) - priorityOf(b) ||
        (isImportant(b) ? 1 : 0) - (isImportant(a) ? 1 : 0) ||
        String(displayOf(a.u_name)).localeCompare(String(displayOf(b.u_name)));
    });
  }

  function uniqueAreas() {
    var seen = {};
    var areas = [];

    state.topics.forEach(function(topic) {
      var area = displayOf(topic.u_area) || 'General';

      if (seen[area]) {
        return;
      }

      seen[area] = true;
      areas.push(area);
    });

    return areas.sort(function(a, b) {
      return String(a).localeCompare(String(b));
    });
  }

  function optionList(defaultLabel, values) {
    var seen = {};
    var options = [{ label: defaultLabel, value: '' }];

    values.forEach(function(value) {
      var text = String(value || '').trim();

      if (!text || seen[text]) {
        return;
      }

      seen[text] = true;
      options.push({ label: text, value: text });
    });

    return options;
  }

  function matchesTopicShape(topic, filters) {
    filters = filters || {};

    if (filters.context && topicContext(topic) !== filters.context) {
      return false;
    }

    if (filters.type && topicType(topic) !== filters.type) {
      return false;
    }

    return true;
  }

  function updateMatchesTopicShape(update, filters) {
    var topic = topicById(valueOf(update.u_topic));

    filters = filters || {};

    if (filters.context && (!topic || topicContext(topic) !== filters.context)) {
      return false;
    }

    if (filters.type && updateType(update) !== filters.type) {
      return false;
    }

    return true;
  }

  function tomorrowMeetingUpdates() {
    var tomorrow = addDays(today(), 1);

    return state.updates.filter(function(update) {
      var topic = topicById(valueOf(update.u_topic));

      return !!topic &&
        isActive(topic) &&
        valueOf(update.u_update_date) === tomorrow &&
        updateType(update) === 'Meeting' &&
        updateMatchesTopicShape(update, state.commandFilter);
    }).sort(function(a, b) {
      return String(valueOf(b.u_update_date)).localeCompare(String(valueOf(a.u_update_date))) ||
        String(valueOf(b.sys_updated_on)).localeCompare(String(valueOf(a.sys_updated_on)));
    });
  }

  function commandTopics(topics) {
    return (topics || activeTopics()).filter(function(topic) {
      return matchesTopicShape(topic, state.commandFilter);
    });
  }

  function matchesPriorityFilter(topic, filterValue) {
    if (filterValue === 'important') {
      return isImportant(topic);
    }

    if (filterValue === 'normal') {
      return !isImportant(topic);
    }

    return true;
  }

  function relatedTodoFromTags(tags) {
    var parts = String(tags || '').split(',');
    var i;
    var part;

    for (i = 0; i < parts.length; i += 1) {
      part = parts[i].trim();

      if (part.toLowerCase().indexOf('todo:') === 0) {
        return part.substring(5).trim();
      }
    }

    return '';
  }

  function tagsWithoutRelatedTodo(tags) {
    return String(tags || '').split(',').filter(function(part) {
      return part.trim() && part.trim().toLowerCase().indexOf('todo:') !== 0;
    }).join(', ');
  }

  function tagsWithRelatedTodo(tags, todoText) {
    var cleaned = tagsWithoutRelatedTodo(tags);
    var relatedTodo = String(todoText || '').trim();
    var parts = cleaned ? [cleaned] : [];

    if (relatedTodo) {
      parts.push('todo:' + relatedTodo);
    }

    return parts.join(', ');
  }

  function noteTypeFromTags(tags) {
    var parts = String(tags || '').split(',');
    var i;
    var part;
    var value;

    for (i = 0; i < parts.length; i += 1) {
      part = parts[i].trim();

      if (part.toLowerCase().indexOf('type:') === 0) {
        value = part.substring(5).trim().toLowerCase();
        return noteTypeLabels[value] ? value : 'thought';
      }
    }

    return 'thought';
  }

  function tagsWithoutNoteType(tags) {
    return String(tags || '').split(',').filter(function(part) {
      return part.trim() && part.trim().toLowerCase().indexOf('type:') !== 0;
    }).join(', ');
  }

  function tagsWithNoteType(tags, type) {
    var cleaned = tagsWithoutNoteType(tags);
    var noteType = noteTypeLabels[type] ? type : 'thought';
    var parts = cleaned ? [cleaned] : [];

    if (noteType !== 'thought') {
      parts.unshift('type:' + noteType);
    }

    return parts.join(', ');
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function dateFromString(dateText) {
    var parts = String(dateText || '').split('-');

    if (parts.length !== 3) {
      return null;
    }

    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  function addDays(dateText, days) {
    var date = dateFromString(dateText) || new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function isWithin(dateText, fromDate, toDate) {
    if (!dateText) {
      return false;
    }

    return String(dateText) >= String(fromDate) && String(dateText) <= String(toDate);
  }

  function lastSevenDays() {
    var days = [];
    var end = today();
    var i;

    for (i = 6; i >= 0; i -= 1) {
      days.push(addDays(end, -i));
    }

    return days;
  }

  function shortDate(dateText) {
    var date = dateFromString(dateText);

    if (!date) {
      return String(dateText || '');
    }

    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric'
    });
  }

  function latestUpdateForTopic(topicId) {
    return updatesForTopic(topicId)[0] || null;
  }

  function topicDueState(topic) {
    var dueDate = valueOf(topic.u_due_date);
    var now = today();

    if (!dueDate) {
      return {
        label: 'No due date',
        className: 'du-signal-muted'
      };
    }

    if (dueDate < now) {
      return {
        label: 'Overdue',
        className: 'du-signal-danger'
      };
    }

    if (dueDate === now) {
      return {
        label: 'Due today',
        className: 'du-signal-warning'
      };
    }

    if (dueDate <= addDays(now, 7)) {
      return {
        label: 'Due soon',
        className: 'du-signal-warning'
      };
    }

    return {
      label: 'Due ' + dueDate,
      className: 'du-signal-muted'
    };
  }

  function openTodoCount(topic) {
    return todosOf(topic).filter(function(todo) {
      return !todo.done;
    }).length;
  }

  function textMatch(text, query) {
    return String(text || '').toLowerCase().indexOf(query) > -1;
  }

  function escapeHtml(text) {
    return String(text || '').replace(/[&<>'"]/g, function(char) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[char];
    });
  }

  function splitLinkText(url) {
    var link = String(url || '');
    var trailing = '';

    while (link && /[.,;!?]$/.test(link.charAt(link.length - 1))) {
      trailing = link.charAt(link.length - 1) + trailing;
      link = link.slice(0, -1);
    }

    while (link && link.charAt(link.length - 1) === ')' &&
        (link.match(/\)/g) || []).length > (link.match(/\(/g) || []).length) {
      trailing = ')' + trailing;
      link = link.slice(0, -1);
    }

    return {
      link: link,
      trailing: trailing
    };
  }

  function linkifyText(text) {
    var source = String(text || '');
    var urlPattern = /\b((?:https?:\/\/|www\.)[^\s<>"']+)/gi;
    var html = '';
    var lastIndex = 0;
    var match;
    var split;
    var href;

    while ((match = urlPattern.exec(source)) !== null) {
      split = splitLinkText(match[0]);

      if (!split.link) {
        continue;
      }

      html += escapeHtml(source.slice(lastIndex, match.index));
      href = /^www\./i.test(split.link) ? 'https://' + split.link : split.link;
      html += '<a class="du-inline-link" href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(split.link) + '</a>';
      html += escapeHtml(split.trailing);
      lastIndex = match.index + match[0].length;
    }

    html += escapeHtml(source.slice(lastIndex));
    return html;
  }

  function renderLinkedTextPreview(sourceId, previewId) {
    var source = byId(sourceId);
    var preview = byId(previewId);
    var text;

    if (!source || !preview) {
      return;
    }

    text = String(source.value || '').trim();
    preview.hidden = !text;
    preview.innerHTML = text ? linkifyText(text) : '';
  }

  function renderLinkedTextPreviews() {
    renderLinkedTextPreview('du-topic-notes', 'du-topic-notes-preview');
    renderLinkedTextPreview('du-progress', 'du-progress-preview');
    renderLinkedTextPreview('du-blockers', 'du-blockers-preview');
    renderLinkedTextPreview('du-next-step', 'du-next-step-preview');
    renderLinkedTextPreview('du-thought-note', 'du-thought-note-preview');
  }

  function notify(message) {
    var toast = byId('du-toast');
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(function() {
      toast.classList.remove('is-visible');
    }, 3600);
  }

  function api(action, payload) {
    if (!state.connection.apiKey) {
      showSettings(true);
      return Promise.reject(new Error('Add your Daily Work Log API key first.'));
    }

    return fetch(endpoint(), {
      method: 'POST',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
        'X-DWL-Key': state.connection.apiKey
      },
      body: JSON.stringify({
        action: action,
        payload: payload || {}
      })
    }).then(function(response) {
      return response.json().catch(function() {
        return {};
      }).then(function(body) {
        var errorMessage = apiErrorMessage(response, body);

        if (errorMessage) {
          throw new Error(errorMessage);
        }

        return apiResult(body);
      });
    });
  }

  function publicApi(action, payload) {
    var instanceUrl = byId('du-instance-url') ? byId('du-instance-url').value : state.connection.instanceUrl;
    var apiPath = byId('du-api-path') ? byId('du-api-path').value : state.connection.apiPath;

    return fetch(normalizeInstanceUrl(instanceUrl || DEFAULT_INSTANCE) + normalizeApiPath(apiPath || DEFAULT_API_PATH), {
      method: 'POST',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: action,
        payload: payload || {}
      })
    }).then(function(response) {
      return response.json().catch(function() {
        return {};
      }).then(function(body) {
        var errorMessage = apiErrorMessage(response, body);

        if (errorMessage) {
          throw new Error(errorMessage);
        }

        return apiResult(body);
      });
    });
  }

  function apiResult(body) {
    if (body && body.result !== undefined) {
      if (body.result && body.result.result !== undefined) {
        return body.result.result;
      }

      return body.result;
    }

    return body;
  }

  function apiErrorMessage(response, body) {
    var detail;

    if (body && body.error) {
      if (typeof body.error === 'string') {
        return body.error;
      }

      detail = body.error.message || body.error.detail || body.error.reason || body.error;
      return typeof detail === 'string' ? detail : JSON.stringify(detail);
    }

    if (body && body.result && body.result.error) {
      return String(body.result.error);
    }

    if (!response.ok) {
      if (body && body.status_message) {
        return String(body.status_message);
      }

      if (body && body.message) {
        return String(body.message);
      }

      return 'Request failed with status ' + response.status;
    }

    return '';
  }

  function topicById(id) {
    return state.topics.filter(function(topic) {
      return topic.sys_id === id;
    })[0] || null;
  }

  function updateById(id) {
    return state.updates.filter(function(update) {
      return update.sys_id === id;
    })[0] || null;
  }

  function thoughtById(id) {
    return state.thoughts.filter(function(thought) {
      return thought.sys_id === id;
    })[0] || null;
  }

  function profileById(id) {
    return state.profiles.filter(function(profile) {
      return profile.sys_id === id;
    })[0] || null;
  }

  function activeTopics() {
    return sortTopics(state.topics.filter(function(topic) {
      return isActive(topic);
    }));
  }

  function updatesForTopic(topicId) {
    return state.updates.filter(function(update) {
      return valueOf(update.u_topic) === topicId;
    }).sort(function(a, b) {
      return String(valueOf(b.u_update_date)).localeCompare(String(valueOf(a.u_update_date))) ||
        String(valueOf(b.sys_updated_on)).localeCompare(String(valueOf(a.sys_updated_on)));
    });
  }

  function updateForTopicDate(topicId, date) {
    return state.updates.filter(function(update) {
      return valueOf(update.u_topic) === topicId && valueOf(update.u_update_date) === date;
    })[0] || null;
  }

  function latestUpdateDateForTopic(topic) {
    var latest = latestUpdateForTopic(topic.sys_id);
    return latest ? valueOf(latest.u_update_date) : '';
  }

  function daysBetween(fromDateText, toDateText) {
    var fromDate = dateFromString(fromDateText);
    var toDate = dateFromString(toDateText);

    if (!fromDate || !toDate) {
      return 999;
    }

    return Math.floor((toDate.getTime() - fromDate.getTime()) / 86400000);
  }

  function pad2(number) {
    number = parseInt(number, 10);
    return (number < 10 ? '0' : '') + number;
  }

  function isoDate(year, month, day) {
    year = parseInt(year, 10);
    month = parseInt(month, 10);
    day = parseInt(day, 10);

    if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) {
      return '';
    }

    return year + '-' + pad2(month) + '-' + pad2(day);
  }

  function monthNumber(monthName) {
    var months = {
      january: 1,
      february: 2,
      march: 3,
      april: 4,
      may: 5,
      june: 6,
      july: 7,
      august: 8,
      september: 9,
      october: 10,
      november: 11,
      december: 12
    };

    return months[String(monthName || '').toLowerCase()] || 0;
  }

  function statusClass(status) {
    return 'du-status-' + String(status || 'on_track').replace(/_/g, '-');
  }

  function formatCount(count, singular, plural) {
    var number = parseInt(count, 10) || 0;
    return number + ' ' + (number === 1 ? singular : plural);
  }

  function profileName(profile) {
    if (!profile) {
      return '';
    }

    return profile.name || profile.email || 'Daily Work Log user';
  }

  function renderConnectionState() {
    var label = byId('du-connection-state');
    var configured = !!state.connection.apiKey;
    var profile = normalizeProfile(state.connection.profile);
    var profileCard = byId('du-connection-profile');
    var instanceInput = byId('du-instance-url');
    var apiPathInput = byId('du-api-path');
    var apiKeyInput = byId('du-api-key');
    var usersNav = byId('du-nav-users');

    if (label) {
      label.textContent = configured ? 'Connected' + (profileName(profile) ? ': ' + profileName(profile) : '') : 'Not connected';
      label.classList.toggle('is-connected', configured);
    }

    if (instanceInput) {
      instanceInput.value = state.connection.instanceUrl || DEFAULT_INSTANCE;
    }

    if (apiPathInput) {
      apiPathInput.value = state.connection.apiPath || DEFAULT_API_PATH;
    }

    if (apiKeyInput) {
      apiKeyInput.value = state.connection.apiKey || '';
    }

    if (usersNav) {
      usersNav.hidden = !state.connection.isAdmin;
    }

    if (!profileCard) {
      return;
    }

    if (configured) {
      profileCard.hidden = false;
      profileCard.innerHTML = [
        '<span class="du-eyebrow">Current profile</span>',
        '<strong>' + escapeHtml(profileName(profile) || 'API key saved') + '</strong>',
        profile && profile.email ? '<small>' + escapeHtml(profile.email) + '</small>' : '<small>Test the connection to confirm the profile.</small>',
        state.connection.isAdmin ? '<small>Admin access enabled</small>' : '',
        '<small>' + escapeHtml(normalizeInstanceUrl(state.connection.instanceUrl || DEFAULT_INSTANCE)) + '</small>'
      ].join('');
    } else {
      profileCard.hidden = true;
      profileCard.innerHTML = '';
    }
  }

  function showSettings(show) {
    if (show) {
      renderConnectionState();
      goToPage('connection');
      return;
    }

    goToPage('home');
  }

  function renderPage() {
    if (state.page === 'users' && !state.connection.isAdmin) {
      if (!hasPage('home')) {
        goToPage('home');
        return;
      }

      state.page = 'home';
    }

    PAGES.forEach(function(page) {
      var pageSection = byId('du-page-' + page);
      var nav = byId('du-nav-' + page);

      if (pageSection) {
        pageSection.hidden = state.page !== page;
      }

      if (nav) {
        nav.classList.toggle('is-selected', state.page === page);
      }
    });

    renderHome();
    renderWorkspace();
    renderTopicsPage();
    renderUpdatesPage();
    renderNotesPage();
    renderAiPage();
    renderUsersPage();
  }

  function showPage(page) {
    if (PAGES.indexOf(page) === -1) {
      return;
    }

    if (page === 'users' && !state.connection.isAdmin) {
      return;
    }

    goToPage(page);
  }

  window.DWL_showPage = showPage;

  function loadAll() {
    return api('listTopics')
      .then(function(topics) {
        state.topics = topics || [];

        if (!state.selectedTopic && activeTopics().length) {
          saveSelectedTopic(activeTopics()[0].sys_id);
        }

        renderTopicOptions();
        return api('listUpdates', {});
      })
      .then(function(updates) {
        state.updates = updates || [];
        renderTopicOptions();
        return api('listThoughts', {}).catch(function(error) {
          state.thoughts = [];
          console.warn('Notes API is not available yet.', error);
          return [];
        });
      })
      .then(function(thoughts) {
        state.thoughts = thoughts || [];
        if (state.connection.isAdmin) {
          return api('listProfiles', {}).catch(function(error) {
            state.profiles = [];
            console.warn('User management API is not available yet.', error);
            return [];
          });
        }

        return [];
      })
      .then(function(profiles) {
        if (state.connection.isAdmin) {
          state.profiles = profiles || [];
        }

        renderPage();
        notify('Daily Work Log loaded.');
      })
      .catch(function(error) {
        notify(error.message);
        console.error(error);
      });
  }

  function renderTopicOptions() {
    [byId('du-update-topic'), byId('du-filter-topic'), byId('du-quick-topic'), byId('du-ai-topic')].forEach(function(select) {
      if (!select) {
        return;
      }

      var current = select.value;
      select.innerHTML = '';

      if (select.id === 'du-filter-topic') {
        select.appendChild(new Option('All topics', ''));
      } else {
        select.appendChild(new Option('Select topic', ''));
      }

      sortTopics(state.topics).forEach(function(topic) {
        if (select.id !== 'du-filter-topic' && !isActive(topic)) {
          return;
        }

        select.appendChild(new Option((displayOf(topic.u_name) || topic.sys_id) + ' - ' + topicContext(topic), topic.sys_id));
      });

      select.value = current || (select.id === 'du-quick-topic' ? state.selectedTopic : '');
    });

    renderAreaOptions(byId('du-topic-filter-area'));
    renderAreaOptions(byId('du-filter-area'));
    renderTopicMetaOptions(byId('du-topic-filter-context'), 'All contexts', topicContextOptions, true);
    renderTopicMetaOptions(byId('du-topic-filter-type'), 'All types', topicTypeOptions, true);
    renderTopicMetaOptions(byId('du-filter-context'), 'All contexts', topicContextOptions, true);
    renderUpdateTypeOptions(byId('du-filter-type'), 'All update types', true);
    renderUpdateTypeOptions(byId('du-update-type'), '', false);
    renderUpdateTypeOptions(byId('du-quick-type'), '', false);
    renderTopicMetaOptions(byId('du-topic-context'), '', topicContextOptions, false);
    renderTopicMetaOptions(byId('du-topic-type'), '', topicTypeOptions, false);
  }

  function renderAreaOptions(select) {
    if (!select) {
      return;
    }

    var current = select.value;
    select.innerHTML = '';
    select.appendChild(new Option('All areas', ''));

    uniqueAreas().forEach(function(area) {
      select.appendChild(new Option(area, area));
    });

    select.value = current;
  }

  function renderTopicMetaOptions(select, allLabel, defaults, includeBlank) {
    if (!select) {
      return;
    }

    var current = select.value;
    var values = defaults.slice();

    state.topics.forEach(function(topic) {
      values.push(select.id.indexOf('context') > -1 ? topicContext(topic) : topicType(topic));
    });

    select.innerHTML = '';

    if (includeBlank) {
      select.appendChild(new Option(allLabel, ''));
    }

    optionList(allLabel, values).forEach(function(option) {
      if (!option.value) {
        return;
      }

      select.appendChild(new Option(option.label, option.value));
    });

    if (current) {
      select.value = current;
    } else if (!includeBlank) {
      select.value = select.id.indexOf('context') > -1 ? 'Other' : 'Technical';
    }
  }

  function renderUpdateTypeOptions(select, allLabel, includeBlank) {
    if (!select) {
      return;
    }

    var current = select.value;
    var values = topicTypeOptions.slice();

    state.updates.forEach(function(update) {
      values.push(updateType(update));
    });

    select.innerHTML = '';

    if (includeBlank) {
      select.appendChild(new Option(allLabel, ''));
    }

    optionList(allLabel, values).forEach(function(option) {
      if (!option.value) {
        return;
      }

      select.appendChild(new Option(option.label, option.value));
    });

    if (current) {
      select.value = current;
    } else if (!includeBlank) {
      select.value = 'Technical';
    }
  }

  function renderRelatedTodoOptions(topic, selectedValue) {
    var select = byId('du-related-todo');

    if (!select) {
      return;
    }

    var current = selectedValue || select.value;
    select.innerHTML = '';
    select.appendChild(new Option('No related to-do', ''));

    if (topic) {
      todosOf(topic).forEach(function(todo) {
        select.appendChild(new Option(todo.text + (todo.done ? ' (done)' : ''), todo.text));
      });
    }

    select.value = current;
  }

  function metricCard(label, value, hint, className, action) {
    return [
      '<button class="du-metric-card ' + className + '" type="button" data-dashboard="' + escapeHtml(action || '') + '">',
      '<span>' + escapeHtml(label) + '</span>',
      '<strong>' + escapeHtml(value) + '</strong>',
      '<small>' + escapeHtml(hint) + '</small>',
      '</button>'
    ].join('');
  }

  function commandChip(label, context, type) {
    var isSelected = (state.commandFilter.context || '') === (context || '') &&
      (state.commandFilter.type || '') === (type || '');

    return [
      '<button class="du-command-chip' + (isSelected ? ' is-selected' : '') + '" type="button" data-command-context="' + escapeHtml(context || '') + '" data-command-type="' + escapeHtml(type || '') + '">',
      escapeHtml(label),
      '</button>'
    ].join('');
  }

  function renderCommandFilters() {
    var container = byId('du-command-filters');

    if (!container) {
      return;
    }

    container.innerHTML = [
      commandChip('All work', '', ''),
      commandChip('Corpay', 'Corpay', ''),
      commandChip('KPMG', 'KPMG', ''),
      commandChip('Meetings', '', 'Meeting'),
      commandChip('Technical', '', 'Technical'),
      commandChip('Research', '', 'Self Research')
    ].join('');
  }

  function handleCommandFilterClick(event) {
    var chip = event.target.closest('[data-command-context]');

    if (!chip) {
      return;
    }

    state.commandFilter = {
      context: chip.getAttribute('data-command-context') || '',
      type: chip.getAttribute('data-command-type') || ''
    };
    setSessionJson(COMMAND_FILTER_KEY, state.commandFilter);
    renderHome();
    renderTopicOptions();
  }

  function renderDashboard() {
    var container = byId('du-dashboard');

    if (!container) {
      return;
    }

    var active = commandTopics(activeTopics());
    var now = today();
    var tomorrow = addDays(now, 1);
    var dueToday = active.filter(function(topic) {
      var dueDate = valueOf(topic.u_due_date);
      return dueDate === now;
    });
    var tomorrowMeetings = tomorrowMeetingUpdates();
    var blockedTopics = active.filter(topicIsBlocked);
    var blockedUpdates = state.updates.filter(function(update) {
      return valueOf(update.u_status) === 'blocked' && updateMatchesTopicShape(update, state.commandFilter);
    });
    var openTodos = active.reduce(function(total, topic) {
      return total + openTodoCount(topic);
    }, 0);

    container.innerHTML = [
      metricCard('Active topics', active.length, openTodos + ' open to-dos', 'du-metric-primary', 'topics-active'),
      metricCard('Due today', dueToday.length, now, dueToday.length ? 'du-metric-warning' : 'du-metric-quiet', 'topics-due-today'),
      metricCard('Blocked', blockedTopics.length || blockedUpdates.length, 'Topics or updates need action', (blockedTopics.length || blockedUpdates.length) ? 'du-metric-danger' : 'du-metric-quiet', 'updates-blocked'),
      metricCard('Tomorrow meetings', tomorrowMeetings.length, 'Meeting updates for ' + tomorrow, tomorrowMeetings.length ? 'du-metric-warning' : 'du-metric-quiet', 'updates-tomorrow-meetings'),
      metricCard('Open to-dos', openTodos, 'Across active topics', openTodos ? 'du-metric-success' : 'du-metric-quiet', 'topics-open-todos')
    ].join('');
  }

  function renderQuickDefaults(topic) {
    var quickDate = byId('du-quick-date');
    var quickTopic = byId('du-quick-topic');
    var quickType = byId('du-quick-type');
    var focus = byId('du-quick-focus');
    var progress = byId('du-quick-progress');
    var pendingDraft = sessionValue(PENDING_AI_DRAFT_KEY);

    if (!quickDate || !quickTopic) {
      return;
    }

    if (!quickDate.value) {
      quickDate.value = today();
    }

    if (!quickTopic.value && topic) {
      quickTopic.value = topic.sys_id;
    }

    if (quickType && topic && (!quickType.value || quickType.value === 'Technical')) {
      quickType.value = topicType(topic);
    }

    if (pendingDraft && focus && progress && !progress.value) {
      focus.value = 'AI assisted update';
      progress.value = pendingDraft;
      setSessionValue(PENDING_AI_DRAFT_KEY, '');
      notify('AI Helper output placed in Quick Capture.');
    }
  }

  function setControlValue(id, value) {
    var control = byId(id);

    if (control) {
      control.value = value || '';
    }
  }

  function setTopicFilterMenu(open) {
    var menu = byId('du-topic-filter-menu');
    var toggle = byId('du-topic-filter-toggle');

    if (menu) {
      menu.hidden = !open;
    }

    if (toggle) {
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
  }

  function topicQuickMode(filters) {
    var dueSoonStart = today();
    var dueSoonEnd = addDays(dueSoonStart, 7);
    var stateFilter = filters.stateFilter;
    var priority = filters.priority;
    var fromDate = filters.fromDate;
    var toDate = filters.toDate;
    var hasShapeFilter = !!(filters.context || filters.type || filters.area || filters.query);

    if (!hasShapeFilter && stateFilter === 'active' && !priority && !fromDate && !toDate) {
      return 'active';
    }

    if (!hasShapeFilter && !stateFilter && !priority && !fromDate && !toDate) {
      return 'all';
    }

    if (!hasShapeFilter && stateFilter === 'active' && priority === 'important' && !fromDate && !toDate) {
      return 'important';
    }

    if (!hasShapeFilter && stateFilter === 'inactive' && !priority && !fromDate && !toDate) {
      return 'inactive';
    }

    if (!hasShapeFilter && stateFilter === 'active' && !priority && fromDate === dueSoonStart && toDate === dueSoonEnd) {
      return 'due-soon';
    }

    return 'custom';
  }

  function topicFilterSummary(filters) {
    var parts = [];

    if (filters.stateFilter === 'active') {
      parts.push('Active');
    } else if (filters.stateFilter === 'inactive') {
      parts.push('Inactive');
    } else {
      parts.push('All');
    }

    if (filters.priority === 'important') {
      parts.push('Important');
    } else if (filters.priority === 'normal') {
      parts.push('Not important');
    }

    if (filters.context) {
      parts.push(filters.context);
    }

    if (filters.type) {
      parts.push(filters.type);
    }

    if (filters.area) {
      parts.push(filters.area);
    }

    if (filters.fromDate || filters.toDate) {
      parts.push('Due ' + (filters.fromDate || 'any') + ' to ' + (filters.toDate || 'any'));
    }

    if (filters.query) {
      parts.push('Search: ' + filters.query);
    }

    return parts.join(' | ') || 'Active topics';
  }

  function renderTopicFilterControls(filters) {
    var mode = topicQuickMode(filters);
    var summary = byId('du-topic-filter-summary');
    var buttons = document.querySelectorAll('[data-topic-filter]');

    Array.prototype.forEach.call(buttons, function(button) {
      var selected = button.getAttribute('data-topic-filter') === mode;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });

    if (summary) {
      summary.textContent = topicFilterSummary(filters);
    }
  }

  function applyTopicQuickFilter(mode) {
    setControlValue('du-topic-filter-context', '');
    setControlValue('du-topic-filter-type', '');
    setControlValue('du-topic-filter-area', '');
    setControlValue('du-topic-filter-priority', '');
    setControlValue('du-topic-filter-from', '');
    setControlValue('du-topic-filter-to', '');
    setControlValue('du-topic-filter-search', '');

    if (mode === 'all') {
      setControlValue('du-topic-filter-state', '');
    } else if (mode === 'important') {
      setControlValue('du-topic-filter-state', 'active');
      setControlValue('du-topic-filter-priority', 'important');
    } else if (mode === 'inactive') {
      setControlValue('du-topic-filter-state', 'inactive');
    } else if (mode === 'due-soon') {
      setControlValue('du-topic-filter-state', 'active');
      setControlValue('du-topic-filter-from', today());
      setControlValue('du-topic-filter-to', addDays(today(), 7));
    } else {
      setControlValue('du-topic-filter-state', 'active');
    }

    renderTopicsPage();
  }

  function handleTopicQuickFilterClick(event) {
    var button = event.target.closest('[data-topic-filter]');

    if (!button) {
      return;
    }

    applyTopicQuickFilter(button.getAttribute('data-topic-filter'));
  }

  function openTopicsWithFilters(filters) {
    setSessionJson(PENDING_TOPIC_FILTER_KEY, filters || {});
    showPage('topics');
  }

  function openNewTopic() {
    saveSelectedTopic('');
    state.topicEditId = '';
    state.topicEditMode = true;
    setSessionJson(PENDING_TOPIC_FILTER_KEY, { create: true });
    showPage('topics');
  }

  function openUpdatesWithFilters(filters) {
    setSessionJson(PENDING_UPDATE_FILTER_KEY, filters || {});
    showPage('updates');
  }

  function applyPendingTopicFilter() {
    var filters = sessionJson(PENDING_TOPIC_FILTER_KEY);

    if (!filters) {
      return;
    }

    setControlValue('du-topic-filter-state', filters.state);
    setControlValue('du-topic-filter-priority', filters.priority);
    setControlValue('du-topic-filter-context', filters.context);
    setControlValue('du-topic-filter-type', filters.type);
    setControlValue('du-topic-filter-area', filters.area);
    setControlValue('du-topic-filter-from', filters.from);
    setControlValue('du-topic-filter-to', filters.to);
    setControlValue('du-topic-filter-search', filters.search);

    if (filters.create) {
      saveSelectedTopic('');
      state.topicEditId = '';
      state.topicEditMode = true;
    } else if (filters.topic) {
      saveSelectedTopic(filters.topic);
    }

    setSessionJson(PENDING_TOPIC_FILTER_KEY, null);
  }

  function applyPendingUpdateFilter() {
    var filters = sessionJson(PENDING_UPDATE_FILTER_KEY);

    if (!filters) {
      return;
    }

    setControlValue('du-filter-topic', filters.topic);
    setControlValue('du-filter-context', filters.context);
    setControlValue('du-filter-type', filters.type);
    setControlValue('du-filter-area', filters.area);
    setControlValue('du-filter-priority', filters.priority);
    setControlValue('du-filter-status', filters.status);
    setControlValue('du-filter-from', filters.from);
    setControlValue('du-filter-to', filters.to);
    setControlValue('du-filter-search', filters.search);
    setSessionJson(PENDING_UPDATE_FILTER_KEY, null);
  }

  function handleDashboardClick(event) {
    var card = event.target.closest('[data-dashboard]');
    var action = card ? card.getAttribute('data-dashboard') : '';
    var now = today();

    if (!action) {
      return;
    }

    if (action === 'topics-active') {
      openTopicsWithFilters({ state: 'active', context: state.commandFilter.context, type: state.commandFilter.type });
      return;
    }

    if (action === 'topics-due-soon') {
      openTopicsWithFilters({ state: 'active', context: state.commandFilter.context, type: state.commandFilter.type, from: now, to: addDays(now, 7) });
      return;
    }

    if (action === 'topics-due-today') {
      openTopicsWithFilters({ state: 'active', context: state.commandFilter.context, type: state.commandFilter.type, from: now, to: now });
      return;
    }

    if (action === 'updates-tomorrow-meetings') {
      openUpdatesWithFilters({ context: state.commandFilter.context, type: 'Meeting', from: addDays(now, 1), to: addDays(now, 1) });
      return;
    }

    if (action === 'topics-open-todos') {
      openTopicsWithFilters({ state: 'active', context: state.commandFilter.context, type: state.commandFilter.type });
      return;
    }

    if (action === 'updates-blocked') {
      openUpdatesWithFilters({ context: state.commandFilter.context, type: state.commandFilter.type, status: 'blocked' });
      return;
    }

    if (action === 'updates-week') {
      openUpdatesWithFilters({ context: state.commandFilter.context, type: state.commandFilter.type, from: addDays(now, -6), to: now });
      return;
    }

    if (action === 'notes-important') {
      showPage('notes');
    }
  }

  function topicIsBlocked(topic) {
    var latest = latestUpdateForTopic(topic.sys_id);
    return latest && valueOf(latest.u_status) === 'blocked';
  }

  function topicFocusScore(topic) {
    var due = valueOf(topic.u_due_date);
    var now = today();
    var score = 0;

    if (due && due < now) {
      score += 120;
    } else if (due === now) {
      score += 95;
    } else if (due && due <= addDays(now, 3)) {
      score += 45;
    }

    if (topicIsBlocked(topic)) {
      score += 90;
    }

    if (isImportant(topic)) {
      score += 35;
    }

    score += Math.min(openTodoCount(topic) * 12, 48);

    if (!latestUpdateForTopic(topic.sys_id)) {
      score += 10;
    }

    return score;
  }

  function topicAttentionReason(topic) {
    var due = topicDueState(topic);
    var latest = latestUpdateForTopic(topic.sys_id);
    var openTodos = openTodoCount(topic);

    if (due.className === 'du-signal-danger') {
      return due.label;
    }

    if (latest && valueOf(latest.u_status) === 'blocked') {
      return 'Latest update is blocked';
    }

    if (openTodos) {
      return openTodos + ' open to-do' + (openTodos === 1 ? '' : 's');
    }

    if (due.className === 'du-signal-warning') {
      return due.label;
    }

    return 'Looks steady';
  }

  function dailyBriefData() {
    var active = commandTopics(activeTopics());
    var now = today();
    var todayFocus = active.slice().sort(function(a, b) {
      return topicFocusScore(b) - topicFocusScore(a) ||
        priorityOf(a) - priorityOf(b) ||
        String(displayOf(a.u_name)).localeCompare(String(displayOf(b.u_name)));
    });
    var risks = active.filter(function(topic) {
      var due = valueOf(topic.u_due_date);
      return (due && due <= now) || topicIsBlocked(topic);
    }).sort(function(a, b) {
      return topicFocusScore(b) - topicFocusScore(a);
    });
    var missingToday = active.filter(function(topic) {
      return !updateForTopicDate(topic.sys_id, now);
    }).sort(function(a, b) {
      return topicFocusScore(b) - topicFocusScore(a);
    });
    var stale = active.filter(function(topic) {
      var lastDate = latestUpdateDateForTopic(topic);
      return !lastDate || daysBetween(lastDate, now) >= 3;
    }).sort(function(a, b) {
      return daysBetween(latestUpdateDateForTopic(b), now) - daysBetween(latestUpdateDateForTopic(a), now);
    });
    var tomorrowMeetings = tomorrowMeetingUpdates();
    var openTodos = active.reduce(function(total, topic) {
      return total + openTodoCount(topic);
    }, 0);

    return {
      date: now,
      active: active,
      todayFocus: todayFocus.slice(0, 3),
      risks: risks.slice(0, 4),
      missingToday: missingToday.slice(0, 4),
      stale: stale.slice(0, 4),
      tomorrowMeetings: tomorrowMeetings.slice(0, 4),
      openTodos: openTodos
    };
  }

  function briefMeta(topic) {
    var lastDate = latestUpdateDateForTopic(topic);

    if (!lastDate) {
      return 'No update logged yet';
    }

    if (lastDate === today()) {
      return 'Updated today';
    }

    return 'Last update ' + shortDate(lastDate);
  }

  function briefSection(title, items, emptyText, labelFn) {
    return [
      '<article class="du-brief-section">',
      '<h3>' + escapeHtml(title) + '</h3>',
      smartList(items.map(function(topic) {
        return smartTopicItem(topic, labelFn ? labelFn(topic) : briefMeta(topic));
      }), emptyText),
      '</article>'
    ].join('');
  }

  function briefUpdateSection(title, items, emptyText) {
    return [
      '<article class="du-brief-section">',
      '<h3>' + escapeHtml(title) + '</h3>',
      smartList(items.map(smartUpdateItem), emptyText),
      '</article>'
    ].join('');
  }

  function renderDailyBrief() {
    var container = byId('du-daily-brief');

    if (!container) {
      return;
    }

    var brief = dailyBriefData();
    var missingCount = brief.missingToday.length;
    var staleCount = brief.stale.length;

    container.innerHTML = [
      '<div class="du-brief-summary">',
      '<div class="du-brief-stat"><span>Focus</span><strong>' + brief.todayFocus.length + '</strong><small>Top items</small></div>',
      '<div class="du-brief-stat"><span>Risks</span><strong>' + brief.risks.length + '</strong><small>Due or blocked</small></div>',
      '<div class="du-brief-stat"><span>Update gaps</span><strong>' + missingCount + '</strong><small>Missing today</small></div>',
      '<div class="du-brief-stat"><span>Stale</span><strong>' + staleCount + '</strong><small>3+ days</small></div>',
      '</div>',
      '<div class="du-brief-grid">',
      briefSection('Today Plan', brief.todayFocus, 'No focus items yet.', topicAttentionReason),
      briefSection('Risks', brief.risks, 'No due or blocked items.', topicAttentionReason),
      briefSection('Needs Update', brief.missingToday, 'All active topics have an update today.', briefMeta),
      briefUpdateSection('Tomorrow Prep', brief.tomorrowMeetings, 'No meeting updates scheduled tomorrow.'),
      '</div>'
    ].join('');
  }

  function dailyBriefText() {
    var brief = dailyBriefData();
    var filterLabel = state.commandFilter.context || state.commandFilter.type ?
      [state.commandFilter.context || 'All contexts', state.commandFilter.type || 'All types'].join(' / ') :
      'All work';
    var lines = [
      '# Daily Work Log Brief - ' + brief.date,
      '',
      'Filter: ' + filterLabel,
      '',
      '## Snapshot',
      '- Active topics: ' + brief.active.length,
      '- Open to-dos: ' + brief.openTodos,
      '- Risks: ' + brief.risks.length,
      '- Missing updates today: ' + brief.missingToday.length,
      '- Tomorrow meetings: ' + brief.tomorrowMeetings.length,
      '',
      '## Today Plan'
    ];

    function pushTopics(items, emptyText, labelFn) {
      if (!items.length) {
        lines.push('- ' + emptyText);
        return;
      }

      items.forEach(function(topic) {
        lines.push('- ' + (displayOf(topic.u_name) || 'Untitled topic') + ' [' + topicMetaText(topic) + '] - ' + (labelFn ? labelFn(topic) : briefMeta(topic)));
      });
    }

    function pushUpdates(items, emptyText) {
      if (!items.length) {
        lines.push('- ' + emptyText);
        return;
      }

      items.forEach(function(update) {
        var topic = topicById(valueOf(update.u_topic));
        var topicName = topic ? displayOf(topic.u_name) : displayOf(update.u_topic);
        lines.push('- ' + (displayOf(update.u_focus) || 'Meeting update') + ' [' + (topicName || 'Unknown topic') + '] - ' + (valueOf(update.u_update_date) || 'No date'));
      });
    }

    pushTopics(brief.todayFocus, 'No focus items yet.', topicAttentionReason);
    lines.push('', '## Risks');
    pushTopics(brief.risks, 'No due or blocked items.', topicAttentionReason);
    lines.push('', '## Needs Update');
    pushTopics(brief.missingToday, 'All active topics have an update today.', briefMeta);
    lines.push('', '## Tomorrow Prep');
    pushUpdates(brief.tomorrowMeetings, 'No meeting updates scheduled tomorrow.');

    return lines.join('\n');
  }

  function selectedWorkspaceTopic() {
    return topicById(state.selectedTopic);
  }

  function selectedMeetingTopic() {
    var select = byId('du-meeting-topic');
    return topicById(select ? select.value : '') || null;
  }

  function cleanMeetingLines(raw) {
    return String(raw || '').split(/\r?\n/).map(function(line) {
      return line.replace(/\s+/g, ' ').trim();
    }).filter(function(line) {
      return !!line;
    });
  }

  function cleanBullet(line) {
    return String(line || '')
      .replace(/^\s*(?:[-*]|\u2022|\d+[.)])\s*/, '')
      .replace(/^\s*(?:action item|action|todo|to-do|follow up|follow-up|decision|risk|blocker|issue|summary|note|next step)s?\s*:\s*/i, '')
      .trim();
  }

  function parseDateFromText(text) {
    var match = String(text || '').match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);

    if (match) {
      return isoDate(match[1], match[2], match[3]);
    }

    match = String(text || '').match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);

    if (match) {
      return isoDate(match[3].length === 2 ? '20' + match[3] : match[3], match[1], match[2]);
    }

    match = String(text || '').match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/i);

    if (match) {
      return isoDate(match[3], monthNumber(match[1]), match[2]);
    }

    return '';
  }

  function firstLabeledValue(lines, labels) {
    var i;
    var j;
    var label;
    var line;
    var lower;

    for (i = 0; i < lines.length; i += 1) {
      line = lines[i];
      lower = line.toLowerCase();

      for (j = 0; j < labels.length; j += 1) {
        label = labels[j].toLowerCase();

        if (lower.indexOf(label + ':') === 0) {
          return line.substring(label.length + 1).trim();
        }
      }
    }

    return '';
  }

  function parseMeetingInviteText(raw) {
    var text = String(raw || '');
    var lines = cleanMeetingLines(text);
    var title = firstLabeledValue(lines, ['Subject', 'Title', 'Topic']);
    var organizer = firstLabeledValue(lines, ['Organizer', 'From', 'Host']);
    var attendees = firstLabeledValue(lines, ['Required', 'Optional', 'Attendees', 'To']);
    var location = firstLabeledValue(lines, ['Location', 'Where']);
    var date = parseDateFromText(text);
    var timeMatch = text.match(/\b(\d{1,2}:\d{2}\s*(?:AM|PM)?)\s*(?:-|to|\u2013|\u2014)\s*(\d{1,2}:\d{2}\s*(?:AM|PM)?)\b/i);
    var linkMatch = text.match(/https?:\/\/[^\s<>"']+/i);
    var i;
    var candidate;

    if (!title) {
      for (i = 0; i < lines.length; i += 1) {
        candidate = lines[i];

        if (!/^(when|where|location|from|to|required|optional|attendees|join|meeting id|passcode|dial-in)\s*:/i.test(candidate) &&
            candidate.indexOf('http') !== 0 &&
            candidate.length > 3) {
          title = candidate;
          break;
        }
      }
    }

    return {
      title: title,
      date: date,
      time: timeMatch ? timeMatch[1].trim() + ' - ' + timeMatch[2].trim() : '',
      organizer: organizer,
      attendees: attendees,
      location: location,
      link: linkMatch ? linkMatch[0].replace(/[),.;]+$/, '') : ''
    };
  }

  function meetingDetailsText(details) {
    var lines = [];

    if (details.title) lines.push('Title: ' + details.title);
    if (details.date) lines.push('Date: ' + details.date);
    if (details.time) lines.push('Time: ' + details.time);
    if (details.organizer) lines.push('Organizer: ' + details.organizer);
    if (details.attendees) lines.push('Attendees: ' + details.attendees);
    if (details.location) lines.push('Location: ' + details.location);
    if (details.link) lines.push('Link: ' + details.link);

    return lines.length ? lines.join('\n') : 'Meeting details not detected. Add details manually.';
  }

  function escapeRegExp(text) {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function replaceNotesSection(notes, title, body) {
    var marker = '## ' + title;
    var section = marker + '\n' + body;
    var re = new RegExp('(^|\\n)' + escapeRegExp(marker) + '[\\s\\S]*?(?=\\n## |$)');
    var current = String(notes || '').trim();

    if (re.test(current)) {
      return current.replace(re, function(prefix) {
        return (prefix || '') + section;
      }).trim();
    }

    return current ? current + '\n\n' + section : section;
  }

  function topicPayload(topic, overrides) {
    overrides = overrides || {};

    return {
      sys_id: topic.sys_id,
      u_name: overrides.u_name !== undefined ? overrides.u_name : displayOf(topic.u_name),
      u_context: overrides.u_context !== undefined ? overrides.u_context : topicContext(topic),
      u_type: overrides.u_type !== undefined ? overrides.u_type : topicType(topic),
      u_area: overrides.u_area !== undefined ? overrides.u_area : displayOf(topic.u_area),
      u_due_date: overrides.u_due_date !== undefined ? overrides.u_due_date : valueOf(topic.u_due_date),
      u_active: overrides.u_active !== undefined ? overrides.u_active : (isActive(topic) ? 'true' : 'false'),
      u_important: overrides.u_important !== undefined ? overrides.u_important : (isImportant(topic) ? 'true' : 'false'),
      u_priority: overrides.u_priority !== undefined ? overrides.u_priority : valueOf(topic.u_priority),
      u_notes: overrides.u_notes !== undefined ? overrides.u_notes : displayOf(topic.u_notes)
    };
  }

  function replaceTopicInState(updatedTopic) {
    var i;

    if (!updatedTopic || !updatedTopic.sys_id) {
      return;
    }

    for (i = 0; i < state.topics.length; i += 1) {
      if (state.topics[i].sys_id === updatedTopic.sys_id) {
        state.topics[i] = updatedTopic;
        return;
      }
    }

    state.topics.push(updatedTopic);
  }

  function parseMeetingMinutesText(raw) {
    var lines = cleanMeetingLines(raw);
    var data = {
      summary: [],
      decisions: [],
      actions: [],
      risks: [],
      next: []
    };
    var section = 'summary';
    var i;
    var line;
    var lower;
    var cleaned;

    for (i = 0; i < lines.length; i += 1) {
      line = lines[i];
      lower = line.toLowerCase().replace(/:$/, '');

      if (/^(summary|notes|discussion|agenda)$/.test(lower)) {
        section = 'summary';
        continue;
      }

      if (/^(decision|decisions|agreed)$/.test(lower)) {
        section = 'decisions';
        continue;
      }

      if (/^(action|actions|action items|todo|to-do|todos|follow ups|follow-ups)$/.test(lower)) {
        section = 'actions';
        continue;
      }

      if (/^(risk|risks|blocker|blockers|issues|concerns)$/.test(lower)) {
        section = 'risks';
        continue;
      }

      if (/^(next|next steps|follow up|follow-up)$/.test(lower)) {
        section = 'next';
        continue;
      }

      cleaned = cleanBullet(line);

      if (!cleaned) {
        continue;
      }

      if (/^(action item|action|todo|to-do|follow up|follow-up)\s*:/i.test(line)) {
        data.actions.push(cleaned);
      } else if (/^(decision|decided|agreed)\s*:/i.test(line)) {
        data.decisions.push(cleaned);
      } else if (/^(risk|blocker|issue|concern)\s*:/i.test(line)) {
        data.risks.push(cleaned);
      } else if (/^(next step|next)\s*:/i.test(line)) {
        data.next.push(cleaned);
      } else {
        data[section].push(cleaned);
      }
    }

    if (!data.summary.length && !data.decisions.length && !data.actions.length && !data.risks.length && !data.next.length && String(raw || '').trim()) {
      data.summary.push(String(raw || '').trim());
    }

    return data;
  }

  function uniqueTextItems(items) {
    var seen = {};
    var out = [];
    var i;
    var value;
    var key;

    for (i = 0; i < items.length; i += 1) {
      value = String(items[i] || '').trim();
      key = value.toLowerCase();

      if (value && !seen[key]) {
        seen[key] = true;
        out.push(value);
      }
    }

    return out;
  }

  function formatMeetingMinutes(topic, minutes) {
    function section(title, items, emptyText) {
      var lines = ['## ' + title];
      var cleanItems = uniqueTextItems(items);
      var i;

      if (!cleanItems.length) {
        lines.push('- ' + emptyText);
      } else {
        for (i = 0; i < cleanItems.length; i += 1) {
          lines.push('- ' + cleanItems[i]);
        }
      }

      return lines.join('\n');
    }

    return [
      '# Meeting Minutes',
      '',
      'Topic: ' + (displayOf(topic.u_name) || 'Selected meeting'),
      'Date: ' + today(),
      '',
      section('Summary', minutes.summary, 'No summary captured.'),
      '',
      section('Decisions', minutes.decisions, 'No decisions captured.'),
      '',
      section('Action Items', minutes.actions, 'No action items captured.'),
      '',
      section('Risks / Blockers', minutes.risks, 'No risks or blockers captured.'),
      '',
      section('Next Steps', minutes.next, 'No next steps captured.')
    ].join('\n');
  }

  function topicMetaText(topic) {
    return [
      topicContext(topic),
      topicType(topic),
      displayOf(topic.u_area) || 'General'
    ].join(' - ');
  }

  function smartTopicItem(topic, reason) {
    var due = topicDueState(topic);

    return [
      '<button class="du-smart-item" type="button" data-action="open-workspace-topic" data-topic="' + topic.sys_id + '">',
      '<span>',
      '<strong>' + escapeHtml(displayOf(topic.u_name)) + '</strong>',
      '<small>' + escapeHtml(topicMetaText(topic)) + '</small>',
      '</span>',
      '<span class="du-signal ' + due.className + '">' + escapeHtml(reason || due.label) + '</span>',
      '</button>'
    ].join('');
  }

  function smartUpdateItem(update) {
    var topic = topicById(valueOf(update.u_topic));

    return [
      '<button class="du-smart-item" type="button" data-action="open-update" data-update="' + update.sys_id + '">',
      '<span>',
      '<strong>' + escapeHtml(displayOf(update.u_focus) || displayOf(update.u_topic) || 'Daily update') + '</strong>',
      '<small>' + escapeHtml(updateType(update) + ' - ' + ((topic ? displayOf(topic.u_name) : displayOf(update.u_topic)) || 'Unknown topic')) + '</small>',
      '</span>',
      '<span class="du-signal ' + statusClass(valueOf(update.u_status)) + '">' + escapeHtml(shortDate(valueOf(update.u_update_date))) + '</span>',
      '</button>'
    ].join('');
  }

  function smartList(items, emptyText) {
    if (!items.length) {
      return '<div class="du-smart-empty">' + escapeHtml(emptyText) + '</div>';
    }

    return items.join('');
  }

  function renderSmartSections() {
    var container = byId('du-smart-sections');

    if (!container) {
      return;
    }

    var active = commandTopics(activeTopics());
    var now = today();
    var todayFocus = active.slice().sort(function(a, b) {
      return topicFocusScore(b) - topicFocusScore(a) ||
        priorityOf(a) - priorityOf(b) ||
        String(displayOf(a.u_name)).localeCompare(String(displayOf(b.u_name)));
    }).slice(0, 4);
    var needsAttention = active.filter(function(topic) {
      var due = valueOf(topic.u_due_date);
      return (due && due < now) ||
        topicIsBlocked(topic) ||
        openTodoCount(topic) > 0;
    }).slice(0, 4);
    var tomorrowMeetings = tomorrowMeetingUpdates().slice(0, 4);
    var recentUpdates = state.updates.filter(function(update) {
      return updateMatchesTopicShape(update, state.commandFilter);
    }).sort(function(a, b) {
      return String(valueOf(b.u_update_date)).localeCompare(String(valueOf(a.u_update_date))) ||
        String(valueOf(b.sys_updated_on)).localeCompare(String(valueOf(a.sys_updated_on)));
    }).slice(0, 4);

    container.innerHTML = [
      '<article class="du-smart-card">',
      '<h2>Today Focus</h2>',
      smartList(todayFocus.map(function(topic) {
        return smartTopicItem(topic, topicAttentionReason(topic));
      }), 'No active topic needs focus yet.'),
      '</article>',
      '<article class="du-smart-card">',
      '<h2>Needs Attention</h2>',
      smartList(needsAttention.map(function(topic) {
        return smartTopicItem(topic, topicAttentionReason(topic));
      }), 'No urgent topic signals.'),
      '</article>',
      '<article class="du-smart-card">',
      '<h2>Tomorrow Meetings</h2>',
      smartList(tomorrowMeetings.map(smartUpdateItem), 'No meeting updates scheduled tomorrow.'),
      '</article>',
      '<article class="du-smart-card">',
      '<h2>Recently Updated</h2>',
      smartList(recentUpdates.map(smartUpdateItem), 'No updates logged yet.'),
      '</article>'
    ].join('');
  }

  function renderHome() {
    var topics = commandTopics(activeTopics());
    var selected = topicById(state.selectedTopic);
    var list = byId('du-home-topic-list');

    if (!list) {
      return;
    }

    if (selected && topics.filter(function(topic) { return topic.sys_id === selected.sys_id; }).length === 0) {
      selected = null;
      saveSelectedTopic('');
    }

    if (!selected && topics.length) {
      saveSelectedTopic(topics[0].sys_id);
      selected = topics[0];
    }

    renderCommandFilters();
    renderDashboard();
    renderDailyBrief();
    renderSmartSections();
    renderQuickDefaults(selected);

    if (!topics.length) {
      list.innerHTML = '<div class="du-empty">No active topics yet. Add one from the Topics page.</div>';
    } else {
      list.innerHTML = topics.map(function(topic) {
        var dueDate = displayOf(topic.u_due_date);
        var isSelected = state.selectedTopic === topic.sys_id;
        var dueState = topicDueState(topic);
        var due = '<span class="du-signal ' + dueState.className + '">' + escapeHtml(dueState.label) + '</span>';
        var important = isImportant(topic);

        return [
          '<article class="du-topic-row' + (isSelected ? ' is-selected' : '') + (important ? ' is-important' : '') + '" draggable="true" data-widget-state="active" data-topic="' + topic.sys_id + '">',
          '<span class="du-drag-handle" title="Drag to set priority">::</span>',
          '<div class="du-topic-main">',
          '<div class="du-topic-title-line">',
          importantIcon(topic, important),
          '<button class="du-topic-select" type="button" data-action="open-workspace-topic" data-topic="' + topic.sys_id + '">',
          '<span class="du-topic-row-title">' + escapeHtml(displayOf(topic.u_name)) + '</span>',
          '</button>',
          '</div>',
          '<button class="du-topic-select du-topic-summary" type="button" data-action="open-workspace-topic" data-topic="' + topic.sys_id + '">',
          '<span class="du-topic-row-meta">' + escapeHtml(topicMetaText(topic)) + ' - ' + formatCount(topic.update_count, 'update', 'updates') + '</span>',
          due,
          '</button>',
          '</div>',
          '</article>'
        ].join('');
      }).join('');
    }
  }

  function topicSelectRow(topic, action, selected) {
    var dueState = topicDueState(topic);
    var important = isImportant(topic);

    return [
      '<article class="du-topic-row' + (selected ? ' is-selected' : '') + (important ? ' is-important' : '') + '" data-widget-state="' + (isActive(topic) ? 'active' : 'inactive') + '" data-topic="' + topic.sys_id + '">',
      '<div class="du-topic-main">',
      '<div class="du-topic-title-line">',
      importantIcon(topic, important),
      '<button class="du-topic-select" type="button" data-action="' + action + '" data-topic="' + topic.sys_id + '">',
      '<span class="du-topic-row-title">' + escapeHtml(displayOf(topic.u_name)) + '</span>',
      '</button>',
      '</div>',
      '<button class="du-topic-select du-topic-summary" type="button" data-action="' + action + '" data-topic="' + topic.sys_id + '">',
      '<span class="du-topic-row-meta">' + escapeHtml(topicMetaText(topic)) + ' - ' + formatCount(topic.update_count, 'update', 'updates') + '</span>',
      '<span class="du-signal ' + dueState.className + '">' + escapeHtml(dueState.label) + '</span>',
      '</button>',
      '</div>',
      '</article>'
    ].join('');
  }

  function renderWorkspace() {
    var list = byId('du-workspace-topic-list');
    var topics = activeTopics();
    var selected = topicById(state.selectedTopic);

    if (!list) {
      return;
    }

    if (!selected && topics.length) {
      saveSelectedTopic(topics[0].sys_id);
      selected = topics[0];
    }

    if (!topics.length) {
      list.innerHTML = '<div class="du-empty">No active topics yet. Add one from the Topics page.</div>';
    } else {
      list.innerHTML = topics.map(function(topic) {
        return topicSelectRow(topic, 'select-workspace-topic', state.selectedTopic === topic.sys_id);
      }).join('');
    }

    renderWorkspaceDetails(selected);
    renderHomeUpdateForm(selected);
    renderTopicFormTodos();
    renderWorkspaceHistory(selected);
  }

  function renderWorkspaceDetails(topic) {
    var detail = byId('du-workspace-topic-detail');

    if (!detail) {
      return;
    }

    if (!topic) {
      detail.innerHTML = '<div class="du-empty">Select an active topic to view details.</div>';
      return;
    }

    detail.innerHTML = topicDetailCard(topic, { compact: true });
  }

  function renderMeetingAutomation(topic) {
    var panel = byId('du-meeting-automation');
    var helper = byId('du-meeting-helper');
    var parseButton = byId('du-parse-meeting-invite');
    var previewButton = byId('du-preview-meeting-minutes');
    var saveButton = byId('du-save-meeting-minutes');
    var disabled = !topic;
    var isMeeting = topic && topicType(topic) === 'Meeting';

    if (!panel) {
      return;
    }

    panel.classList.toggle('is-meeting-topic', !!isMeeting);
    panel.classList.toggle('is-disabled', disabled);

    if (helper) {
      if (!topic) {
        helper.textContent = 'Select a topic before using meeting automation.';
      } else if (isMeeting) {
        helper.textContent = 'Paste an invite to update meeting details, or paste rough notes to create minutes and action items.';
      } else {
        helper.textContent = 'This topic is not marked as Meeting yet. Saving meeting details or minutes will convert it to Meeting.';
      }
    }

    [parseButton, previewButton, saveButton].forEach(function(button) {
      if (button) {
        button.disabled = disabled;
      }
    });
  }

  function parseMeetingInviteIntoTopic() {
    var topic = selectedMeetingTopic();
    var source = byId('du-meeting-source');
    var details;
    var notes;

    if (!topic) {
      notify('Select a topic before parsing an invite.');
      return;
    }

    if (!source || !source.value.trim()) {
      notify('Paste meeting invite text first.');
      return;
    }

    details = parseMeetingInviteText(source.value);

    if (!details.title && !details.date && !details.time && !details.link && !details.attendees) {
      notify('No meeting details were detected.');
      return;
    }

    notes = replaceNotesSection(displayOf(topic.u_notes), 'Meeting Details', meetingDetailsText(details));

    api('saveTopic', topicPayload(topic, {
      u_name: details.title || displayOf(topic.u_name),
      u_type: 'Meeting',
      u_due_date: details.date || valueOf(topic.u_due_date),
      u_notes: notes
    }))
      .then(function(updatedTopic) {
        replaceTopicInState(updatedTopic);
        saveSelectedTopic(updatedTopic.sys_id);
        renderTopicOptions();
        renderPage();
        notify('Meeting details saved to topic.');
      })
      .catch(function(error) {
        notify('Could not save meeting details: ' + error.message);
        console.error(error);
      });
  }

  function previewMeetingMinutes() {
    var topic = selectedMeetingTopic();
    var source = byId('du-meeting-source');
    var preview = byId('du-meeting-preview');
    var minutes;

    if (!topic) {
      notify('Select a topic first.');
      return;
    }

    if (!source || !source.value.trim()) {
      notify('Paste rough meeting notes first.');
      return;
    }

    minutes = parseMeetingMinutesText(source.value);

    if (preview) {
      preview.value = formatMeetingMinutes(topic, minutes);
    }

    notify('Meeting minutes preview generated.');
  }

  function mergeActionTodos(topic, actions) {
    var todos = todosOf(topic);
    var seen = {};
    var merged = todos.slice();
    var added = 0;

    todos.forEach(function(todo) {
      seen[String(todo.text || '').trim().toLowerCase()] = true;
    });

    uniqueTextItems(actions).forEach(function(action) {
      var key = action.toLowerCase();

      if (!seen[key]) {
        merged.push({ text: action, done: false });
        seen[key] = true;
        added += 1;
      }
    });

    return {
      todos: merged,
      added: added
    };
  }

  function appendMeetingTodos(topic, actions) {
    var merged = mergeActionTodos(topic, actions);

    if (!merged.added) {
      return Promise.resolve(0);
    }

    return api('saveTopicTodos', {
      sys_id: topic.sys_id,
      todos: merged.todos
    }).then(function(updatedTopic) {
      replaceTopicInState(updatedTopic);
      return merged.added;
    });
  }

  function saveMeetingMinutes() {
    var topic = selectedMeetingTopic();
    var source = byId('du-meeting-source');
    var preview = byId('du-meeting-preview');
    var raw = source ? source.value.trim() : '';
    var minutes;
    var formatted;
    var actionTodos;
    var meetingTopic;

    if (!topic) {
      notify('Select a topic before saving minutes.');
      return;
    }

    if (!raw) {
      notify('Paste rough meeting notes first.');
      return;
    }

    minutes = parseMeetingMinutesText(raw);
    formatted = formatMeetingMinutes(topic, minutes);
    actionTodos = uniqueTextItems(minutes.actions.concat(minutes.next));

    if (preview) {
      preview.value = formatted;
    }

    Promise.resolve(topicType(topic) === 'Meeting' ? topic : api('saveTopic', topicPayload(topic, {
      u_type: 'Meeting'
    })).then(function(updatedTopic) {
      replaceTopicInState(updatedTopic);
      return updatedTopic;
    }))
      .then(function(topicForUpdate) {
        meetingTopic = topicForUpdate;
        return api('saveUpdate', {
          u_topic: meetingTopic.sys_id,
          u_update_date: today(),
          u_focus: 'Meeting minutes',
          u_status: minutes.risks.length ? 'watching' : 'on_track',
          u_type: 'Meeting',
          u_progress: formatted,
          u_blockers: uniqueTextItems(minutes.risks).join('\n'),
          u_next_step: actionTodos.join('\n'),
          u_confidence: '80',
          u_tags: 'meeting-minutes, automation'
        });
      })
      .then(function() {
        return appendMeetingTodos(meetingTopic, actionTodos);
      })
      .then(function(addedTodos) {
        byId('du-meeting-source').value = '';
        return loadAll().then(function() {
          notify('Meeting minutes saved as a topic update' + (addedTodos ? ' and ' + addedTodos + ' to-do' + (addedTodos === 1 ? '' : 's') + ' added.' : '.'));
        });
      })
      .catch(function(error) {
        notify('Could not save meeting minutes: ' + error.message);
        console.error(error);
      });
  }

  function renderWorkspaceHistory(topic) {
    var list = byId('du-workspace-history-list');
    var updates;

    if (!list) {
      return;
    }

    if (!topic) {
      list.innerHTML = '<div class="du-empty">No topic selected.</div>';
      return;
    }

    updates = updatesForTopic(topic.sys_id);

    if (!updates.length) {
      list.innerHTML = '<div class="du-empty">No previous updates for this topic.</div>';
      return;
    }

    list.innerHTML = updates.map(updateCard).join('');
  }

  function importantIcon(topic, important) {
    var label = important ? 'Remove important' : 'Mark important';
    return '<button class="du-important-icon' + (important ? ' is-important' : '') + '" type="button" data-action="toggle-important" data-topic="' + topic.sys_id + '" title="' + label + '" aria-label="' + label + '">&#9733;</button>';
  }

  function renderHomeDetails(topic) {
    var detail = byId('du-home-topic-detail');

    if (!detail) {
      return;
    }

    if (!topic) {
      detail.innerHTML = '<div class="du-empty">Select an active topic to view details.</div>';
      return;
    }

    detail.innerHTML = topicDetailCard(topic);
  }

  function topicDetailCard(topic, options) {
    options = options || {};

    var status = topic.latest_status ? statusLabels[topic.latest_status] || topic.latest_status : 'No updates';
    var dueDate = displayOf(topic.u_due_date) || 'No due date';
    var notes = displayOf(topic.u_notes) || 'No notes added.';
    var active = isActive(topic);
    var stateText = active ? 'Active' : 'Inactive';
    var stateClass = active ? 'du-topic-state-active' : 'du-topic-state-inactive';
    var confidence = displayOf(topic.latest_confidence);

    confidence = confidence ? confidence + (confidence.indexOf('%') === -1 ? '%' : '') : 'n/a';

    if (options.compact) {
      return [
        '<div class="du-detail-card du-detail-card-compact" data-widget-state="' + (active ? 'active' : 'inactive') + '">',
        '<div class="du-detail-head du-compact-detail-head">',
        '<span class="du-compact-important' + (isImportant(topic) ? ' is-important' : '') + '" title="' + (isImportant(topic) ? 'Important topic' : 'Not marked important') + '" aria-label="' + (isImportant(topic) ? 'Important topic' : 'Not marked important') + '">&#9733;</span>',
        '<div>',
        '<span class="du-eyebrow">Selected topic</span>',
        '<h2>' + escapeHtml(displayOf(topic.u_name)) + '</h2>',
        '<p>' + escapeHtml(topicMetaText(topic)) + '</p>',
        '</div>',
        '<span class="du-topic-state ' + stateClass + '">' + stateText + '</span>',
        '</div>',
        '<div class="du-compact-metrics">',
        '<span class="du-compact-metric-due"><strong>Due:</strong>' + escapeHtml(dueDate) + '</span>',
        '<span class="du-compact-metric-status"><strong>Status:</strong>' + escapeHtml(status) + '</span>',
        '<span class="du-compact-metric-todos"><strong>To-dos:</strong>' + escapeHtml(todoSummary(topic)) + '</span>',
        '<span class="du-compact-metric-confidence"><strong>Confidence:</strong>' + escapeHtml(confidence) + '</span>',
        '</div>',
        notes !== 'No notes added.' ? '<details class="du-compact-notes"><summary>Notes</summary><p class="du-notes">' + linkifyText(notes) + '</p></details>' : '',
        '</div>'
      ].join('');
    }

    return [
      '<div class="du-detail-card" data-widget-state="' + (active ? 'active' : 'inactive') + '">',
      '<div class="du-detail-head">',
      '<div>',
      '<span class="du-eyebrow">Topic details</span>',
      '<h2>' + escapeHtml(displayOf(topic.u_name)) + '</h2>',
      '<p>' + escapeHtml(topicMetaText(topic)) + '</p>',
      '</div>',
      '<span class="du-topic-state ' + stateClass + '">' + stateText + '</span>',
      '</div>',
      '<dl class="du-detail-grid">',
      '<div><dt>Context</dt><dd>' + escapeHtml(topicContext(topic)) + '</dd></div>',
      '<div><dt>Type</dt><dd>' + escapeHtml(topicType(topic)) + '</dd></div>',
      '<div><dt>Area</dt><dd>' + escapeHtml(displayOf(topic.u_area) || 'General') + '</dd></div>',
      '<div><dt>Due date</dt><dd>' + escapeHtml(dueDate) + '</dd></div>',
      '<div><dt>Important</dt><dd>' + (isImportant(topic) ? 'Yes' : 'No') + '</dd></div>',
      '<div><dt>Updates</dt><dd>' + escapeHtml(topic.update_count || 0) + '</dd></div>',
      '<div><dt>Latest status</dt><dd>' + escapeHtml(status) + '</dd></div>',
      '<div><dt>Confidence</dt><dd>' + escapeHtml(topic.latest_confidence || 'n/a') + '</dd></div>',
      '</dl>',
      '<p class="du-notes">' + linkifyText(notes) + '</p>',
      options.actions ? [
        '<div class="du-card-actions du-detail-summary-actions">',
        '<button class="du-link-btn" type="button" data-action="edit-topic" data-topic="' + topic.sys_id + '">Edit topic</button>',
        '<button class="du-link-btn" type="button" data-action="' + (active ? 'deactivate-topic' : 'activate-topic') + '" data-topic="' + topic.sys_id + '">' + (active ? 'Mark inactive' : 'Mark active') + '</button>',
        '<button class="du-link-btn du-danger-text" type="button" data-action="delete-topic" data-topic="' + topic.sys_id + '">Delete topic</button>',
        '</div>'
      ].join('') : '',
      '</div>'
    ].join('');
  }

  function renderTopicDetailSummary(topic) {
    var container = byId('du-topic-detail-summary');

    if (!container) {
      return;
    }

    if (!topic) {
      container.innerHTML = '<div class="du-empty">Create a new topic or select one from the list.</div>';
      return;
    }

    container.innerHTML = topicDetailCard(topic, { actions: true });
  }

  function setTopicEditorVisible(editing) {
    var form = byId('du-topic-form');
    var summary = byId('du-topic-detail-summary');

    state.topicEditMode = !!editing;

    if (form) {
      form.hidden = !state.topicEditMode;
    }

    if (summary) {
      summary.hidden = state.topicEditMode;
    }
  }

  function renderTopicUpdateHistory(topic) {
    var list = byId('du-topic-update-history');
    var updates;

    if (!list) {
      return;
    }

    if (!topic) {
      list.innerHTML = '<div class="du-empty">Select a topic to view its updates.</div>';
      return;
    }

    updates = updatesForTopic(topic.sys_id);

    if (!updates.length) {
      list.innerHTML = '<div class="du-empty">No updates have been saved to this topic yet.</div>';
      return;
    }

    list.innerHTML = updates.map(updateCard).join('');
  }

  function renderHomeUpdateForm(topic) {
    var updateDate = byId('du-update-date');
    var progress = byId('du-progress');
    var focus = byId('du-focus');
    var tags = byId('du-tags');
    var pendingUpdateId = sessionValue(PENDING_UPDATE_ID_KEY);
    var pendingUpdate = pendingUpdateId ? updateById(pendingUpdateId) : null;
    var pendingDate = sessionValue(PENDING_UPDATE_DATE_KEY);
    var pendingDraft = sessionValue(PENDING_AI_DRAFT_KEY);
    var date = pendingUpdate ? valueOf(pendingUpdate.u_update_date) : updateDate ? updateDate.value || pendingDate || today() : today();
    var existing = pendingUpdate || (topic ? updateForTopicDate(topic.sys_id, date) : null);

    if (!updateDate) {
      return;
    }

    updateDate.value = date;
    byId('du-update-topic').value = topic ? topic.sys_id : '';
    byId('du-update-id').value = existing ? existing.sys_id : '';
    byId('du-focus').value = existing ? displayOf(existing.u_focus) : '';
    byId('du-status').value = existing ? valueOf(existing.u_status) || 'on_track' : 'on_track';
    if (byId('du-update-type')) {
      byId('du-update-type').value = existing ? updateType(existing) : (topic ? topicType(topic) : 'Technical');
    }
    byId('du-progress').value = existing ? displayOf(existing.u_progress) : '';
    byId('du-blockers').value = existing ? displayOf(existing.u_blockers) : '';
    byId('du-next-step').value = existing ? displayOf(existing.u_next_step) : '';
    byId('du-confidence').value = existing ? valueOf(existing.u_confidence) || '70' : '70';
    byId('du-confidence-output').textContent = byId('du-confidence').value + '%';
    byId('du-tags').value = existing ? tagsWithoutRelatedTodo(displayOf(existing.u_tags)) : '';
    renderRelatedTodoOptions(topic, existing ? relatedTodoFromTags(displayOf(existing.u_tags)) : '');
    byId('du-save-update-label').textContent = existing ? 'Update daily update' : 'Save daily update';
    setSessionValue(PENDING_UPDATE_ID_KEY, '');
    setSessionValue(PENDING_UPDATE_DATE_KEY, '');

    if (pendingDraft && progress && focus && tags) {
      progress.value = pendingDraft;
      focus.value = 'AI assisted update';
      tags.value = tagsWithRelatedTodo('ai-assisted', byId('du-related-todo') ? byId('du-related-todo').value : '');
      setSessionValue(PENDING_AI_DRAFT_KEY, '');
    }

    renderLinkedTextPreviews();
  }

  function renderHomeHistory(topic) {
    var list = byId('du-home-history-list');

    if (!list) {
      return;
    }

    if (!topic) {
      list.innerHTML = '<div class="du-empty">No topic selected.</div>';
      return;
    }

    var updates = updatesForTopic(topic.sys_id);

    if (!updates.length) {
      list.innerHTML = '<div class="du-empty">No previous updates for this topic.</div>';
      return;
    }

    list.innerHTML = updates.map(updateCard).join('');
  }

  function renderTodoList(topic, context) {
    var todos = todosOf(topic);
    var idPrefix = 'du-todo-' + context + '-' + topic.sys_id;
    var items;

    if (!todos.length) {
      items = '<div class="du-todo-empty">No to-dos yet.</div>';
    } else {
      items = todos.map(function(todo, index) {
        var inputId = idPrefix + '-' + index;

        return [
          '<div class="du-todo-item' + (todo.done ? ' is-done' : '') + '">',
          '<input id="' + inputId + '" type="checkbox" data-action="toggle-todo" data-topic="' + topic.sys_id + '" data-todo="' + index + '"' + (todo.done ? ' checked' : '') + '>',
          '<label for="' + inputId + '">' + escapeHtml(todo.text) + '</label>',
          '<button class="du-todo-delete" type="button" data-action="delete-todo" data-topic="' + topic.sys_id + '" data-todo="' + index + '" title="Delete to-do">x</button>',
          '</div>'
        ].join('');
      }).join('');
    }

    return [
      '<div class="du-todo-list" data-topic="' + topic.sys_id + '">',
      items,
      '<div class="du-todo-add">',
      '<input class="du-todo-input" type="text" maxlength="160" placeholder="Add to-do" data-topic="' + topic.sys_id + '">',
      '<button class="du-link-btn" type="button" data-action="add-todo" data-topic="' + topic.sys_id + '">Add</button>',
      '</div>',
      '</div>'
    ].join('');
  }

  function topicForTopicPageTools() {
    if (state.topicEditMode && state.topicEditId) {
      return topicById(state.topicEditId);
    }

    return topicById(state.selectedTopic);
  }

  function renderTopicTodosInto(containerId, topic, context, emptyMessage) {
    var container = byId(containerId);

    if (!container) {
      return;
    }

    if (!topic) {
      container.innerHTML = '<div class="du-todo-empty">' + escapeHtml(emptyMessage) + '</div>';
      return;
    }

    container.innerHTML = renderTodoList(topic, context);
  }

  function renderTopicFormTodos() {
    renderTopicTodosInto('du-topic-form-todos', topicForTopicPageTools(), 'form', 'Save or select a topic before adding to-dos.');
    renderTopicTodosInto('du-workspace-topic-todos', topicById(state.selectedTopic), 'workspace', 'Select a workspace topic before adding to-dos.');
  }

  function renderTopicsPage() {
    var list = byId('du-topics-list');
    var selected;

    if (!list) {
      return;
    }

    applyPendingTopicFilter();

    var context = byId('du-topic-filter-context').value;
    var type = byId('du-topic-filter-type').value;
    var area = byId('du-topic-filter-area').value;
    var stateFilter = byId('du-topic-filter-state').value;
    var priority = byId('du-topic-filter-priority').value;
    var fromDate = byId('du-topic-filter-from').value;
    var toDate = byId('du-topic-filter-to').value;
    var query = byId('du-topic-filter-search').value.trim().toLowerCase();
    var topics;

    renderTopicFilterControls({
      context: context,
      type: type,
      area: area,
      stateFilter: stateFilter,
      priority: priority,
      fromDate: fromDate,
      toDate: toDate,
      query: query
    });

    selected = topicForTopicPageTools();

    if (state.topicEditMode) {
      if (selected) {
        populateTopicForm(selected);
      } else {
        setTopicEditorVisible(true);

        if (byId('du-topic-detail-title')) {
          byId('du-topic-detail-title').textContent = 'New topic';
        }
      }
    } else {
      state.topicEditId = '';
      setTopicEditorVisible(false);

      if (byId('du-topic-detail-title')) {
        byId('du-topic-detail-title').textContent = selected ? 'Topic summary' : 'Topic summary';
      }

      renderTopicDetailSummary(selected);
    }

    renderTopicFormTodos();
    renderTopicUpdateHistory(selected);

    if (!state.topics.length) {
      list.innerHTML = '<div class="du-empty">No topics yet.</div>';
      return;
    }

    topics = sortTopics(state.topics).filter(function(topic) {
      var dueDate = valueOf(topic.u_due_date);
      var topicArea = displayOf(topic.u_area) || 'General';
      var active = isActive(topic);
      var haystack = [
        displayOf(topic.u_name),
        topicContext(topic),
        topicType(topic),
        topicArea,
        displayOf(topic.u_notes)
      ].join(' ').toLowerCase();

      if (stateFilter === 'active' && !active) {
        return false;
      }

      if (stateFilter === 'inactive' && active) {
        return false;
      }

      if (area && topicArea !== area) {
        return false;
      }

      if (!matchesTopicShape(topic, { context: context, type: type })) {
        return false;
      }

      if (!matchesPriorityFilter(topic, priority)) {
        return false;
      }

      if (fromDate && (!dueDate || dueDate < fromDate)) {
        return false;
      }

      if (toDate && (!dueDate || dueDate > toDate)) {
        return false;
      }

      if (query && haystack.indexOf(query) === -1) {
        return false;
      }

      return true;
    });

    if (!topics.length) {
      list.innerHTML = '<div class="du-empty">No topics match the filters.</div>';
      return;
    }

    list.innerHTML = topics.map(function(topic) {
      var active = isActive(topic);
      var important = isImportant(topic);
      var stateText = active ? 'Active' : 'Inactive';
      var stateClass = active ? 'du-topic-state-active' : 'du-topic-state-inactive';
      var dueDate = displayOf(topic.u_due_date) || 'No due date';
      var dueState = topicDueState(topic);
      var currentTopicId = state.topicEditMode && state.topicEditId ? state.topicEditId : state.selectedTopic;
      var selectedClass = currentTopicId === topic.sys_id ? ' is-selected' : '';

      return [
        '<article class="du-topic-card du-topic-master-card' + selectedClass + (important ? ' is-important' : '') + '" data-widget-state="' + (active ? 'active' : 'inactive') + '">',
        '<div class="du-topic-title-line">',
        importantIcon(topic, important),
        '<button class="du-topic-select" type="button" data-action="open-topic-detail" data-topic="' + topic.sys_id + '">',
        '<span class="du-topic-row-title">' + escapeHtml(displayOf(topic.u_name)) + '</span>',
        '</button>',
        '</div>',
        '<button class="du-topic-select du-topic-summary" type="button" data-action="open-topic-detail" data-topic="' + topic.sys_id + '">',
        '<span class="du-topic-row-meta">' + escapeHtml(topicMetaText(topic)) + ' - Due ' + escapeHtml(dueDate) + '</span>',
        '<span class="du-topic-row-meta">' + escapeHtml(formatCount(topic.update_count, 'update', 'updates')) + '</span>',
        '</button>',
        '<div class="du-topic-badges">',
        '<span class="du-topic-state ' + stateClass + '">' + stateText + '</span>',
        '<span class="du-signal ' + dueState.className + '">' + escapeHtml(dueState.label) + '</span>',
        '<span class="du-signal du-signal-muted">' + escapeHtml(todoSummary(topic)) + '</span>',
        '</div>',
        '</article>'
      ].join('');
    }).join('');
  }

  function renderWeekView() {
    var container = byId('du-week-view');

    if (!container) {
      return;
    }

    var days = lastSevenDays();

    container.innerHTML = days.map(function(day) {
      var dayUpdates = state.updates.filter(function(update) {
        return valueOf(update.u_update_date) === day;
      });
      var dueTopics = activeTopics().filter(function(topic) {
        return valueOf(topic.u_due_date) === day;
      });
      var blocked = dayUpdates.filter(function(update) {
        return valueOf(update.u_status) === 'blocked';
      }).length;
      var className = day === today() ? ' is-today' : '';

      if (blocked) {
        className += ' has-blocked';
      } else if (dayUpdates.length || dueTopics.length) {
        className += ' has-work';
      }

      return [
        '<article class="du-day-pill' + className + '">',
        '<span>' + escapeHtml(shortDate(day)) + '</span>',
        '<strong>' + escapeHtml(dayUpdates.length) + '</strong>',
        '<small>' + escapeHtml(formatCount(dueTopics.length, 'due topic', 'due topics')) + '</small>',
        '</article>'
      ].join('');
    }).join('');
  }

  function renderUpdatesPage() {
    var list = byId('du-all-updates-list');

    if (!list) {
      return;
    }

    applyPendingUpdateFilter();

    var query = byId('du-filter-search').value.trim().toLowerCase();
    var topic = byId('du-filter-topic').value;
    var context = byId('du-filter-context').value;
    var type = byId('du-filter-type').value;
    var area = byId('du-filter-area').value;
    var priority = byId('du-filter-priority').value;
    var status = byId('du-filter-status').value;
    var fromDate = byId('du-filter-from').value;
    var toDate = byId('du-filter-to').value;
    var updates = state.updates.filter(function(update) {
      var updateDate = valueOf(update.u_update_date);
      var updateTopic = topicById(valueOf(update.u_topic));
      var updateArea = updateTopic ? displayOf(updateTopic.u_area) || 'General' : '';
      var haystack;

      if (topic && valueOf(update.u_topic) !== topic) {
        return false;
      }

      if (area && updateArea !== area) {
        return false;
      }

      if (context && (!updateTopic || topicContext(updateTopic) !== context)) {
        return false;
      }

      if (type && updateType(update) !== type) {
        return false;
      }

      if (priority && (!updateTopic || !matchesPriorityFilter(updateTopic, priority))) {
        return false;
      }

      if (status && valueOf(update.u_status) !== status) {
        return false;
      }

      if (fromDate && updateDate < fromDate) {
        return false;
      }

      if (toDate && updateDate > toDate) {
        return false;
      }

      if (!query) {
        return true;
      }

      haystack = [
        displayOf(update.u_topic),
        updateTopic ? topicContext(updateTopic) : '',
        updateTopic ? topicType(updateTopic) : '',
        updateType(update),
        updateArea,
        displayOf(update.u_focus),
        displayOf(update.u_progress),
        displayOf(update.u_blockers),
        displayOf(update.u_next_step),
        displayOf(update.u_tags),
        statusLabels[valueOf(update.u_status)]
      ].join(' ').toLowerCase();

      return haystack.indexOf(query) > -1;
    }).sort(function(a, b) {
      return String(valueOf(b.u_update_date)).localeCompare(String(valueOf(a.u_update_date))) ||
        String(valueOf(b.sys_updated_on)).localeCompare(String(valueOf(a.sys_updated_on)));
    });

    renderWeekView();

    if (!updates.length) {
      list.innerHTML = '<div class="du-empty">No updates found.</div>';
      return;
    }

    list.innerHTML = updates.map(updateCard).join('');
  }

  function renderNotesPage() {
    var list = byId('du-thought-list');

    if (!list) {
      return;
    }

    var thoughts = state.thoughts.slice().sort(function(a, b) {
      return String(b.u_important).localeCompare(String(a.u_important)) ||
        String(valueOf(b.u_note_date)).localeCompare(String(valueOf(a.u_note_date))) ||
        String(valueOf(b.sys_updated_on)).localeCompare(String(valueOf(a.sys_updated_on)));
    });

    if (!thoughts.length) {
      list.innerHTML = '<div class="du-empty">No notes yet.</div>';
      return;
    }

    list.innerHTML = thoughts.map(thoughtCard).join('');
  }

  function renderAiPage() {
    var aiSelect = byId('du-ai-topic');
    var meetingSelect = byId('du-meeting-topic');
    var active = activeTopics();
    var currentAi;
    var currentMeeting;

    if (!aiSelect && !meetingSelect) {
      return;
    }

    if (meetingSelect) {
      currentMeeting = meetingSelect.value || state.selectedTopic || (active[0] ? active[0].sys_id : '');
      meetingSelect.innerHTML = '';

      active.forEach(function(topic) {
        meetingSelect.appendChild(new Option(displayOf(topic.u_name) || topic.sys_id, topic.sys_id));
      });

      meetingSelect.value = currentMeeting && topicById(currentMeeting) ? currentMeeting : (active[0] ? active[0].sys_id : '');

      if (meetingSelect.value) {
        saveSelectedTopic(meetingSelect.value);
      }
    }

    if (aiSelect) {
      currentAi = aiSelect.value || state.selectedTopic;
      aiSelect.innerHTML = '';
      aiSelect.appendChild(new Option('All active topics', ''));

      active.forEach(function(topic) {
        aiSelect.appendChild(new Option(displayOf(topic.u_name) || topic.sys_id, topic.sys_id));
      });

      aiSelect.value = currentAi && topicById(currentAi) ? currentAi : '';
    }

    renderMeetingAutomation(selectedMeetingTopic());
    renderAiHelperMode();
  }

  function renderAiHelperMode() {
    var meetingPanel = byId('du-helper-panel-meeting');
    var assistPanel = byId('du-helper-panel-assist');
    var meetingTab = byId('du-helper-tab-meeting');
    var assistTab = byId('du-helper-tab-assist');
    var output = byId('du-ai-output');
    var mode = state.aiHelperMode === 'assist' ? 'assist' : 'meeting';

    if (meetingPanel) {
      meetingPanel.hidden = mode !== 'meeting';
    }

    if (assistPanel) {
      assistPanel.hidden = mode !== 'assist';
    }

    if (meetingTab) {
      meetingTab.classList.toggle('is-selected', mode === 'meeting');
    }

    if (assistTab) {
      assistTab.classList.toggle('is-selected', mode === 'assist');
    }

    if (output && mode === 'meeting') {
      output.textContent = 'Meeting Parser is selected. Use Preview minutes for meeting output, or switch to AI Assist for local suggestions.';
    }
  }

  function setAiOutput(text) {
    var output = byId('du-ai-output');

    if (output) {
      output.textContent = text || 'No suggestion generated.';
    }
  }

  function selectedAiTopic() {
    var select = byId('du-ai-topic');
    return topicById(select ? select.value : '') || topicById(state.selectedTopic) || activeTopics()[0] || null;
  }

  function sentenceParts(text) {
    return String(text || '').split(/\n|\.|;|\u2022|-/).map(function(part) {
      return part.trim();
    }).filter(function(part) {
      return part.length > 0;
    }).slice(0, 8);
  }

  function topicHealth(topic) {
    var latest = topic ? latestUpdateForTopic(topic.sys_id) : null;
    var due = topic ? topicDueState(topic) : { label: 'No topic selected', className: 'du-signal-muted' };
    var openTodos = topic ? openTodoCount(topic) : 0;
    var status = latest ? valueOf(latest.u_status) : '';
    var score = 80;

    if (due.className === 'du-signal-danger') {
      score -= 25;
    } else if (due.className === 'du-signal-warning') {
      score -= 10;
    }

    if (status === 'blocked') {
      score -= 30;
    } else if (status === 'watching') {
      score -= 12;
    } else if (status === 'paused') {
      score -= 15;
    } else if (status === 'complete') {
      score += 15;
    }

    score -= Math.min(openTodos * 4, 20);

    if (!latest) {
      score -= 15;
    }

    if (score < 0) {
      score = 0;
    }

    if (score > 100) {
      score = 100;
    }

    return {
      score: score,
      latest: latest,
      due: due,
      openTodos: openTodos,
      status: status || 'none'
    };
  }

  function aiAnalyzeTopic() {
    var topic = selectedAiTopic();
    var health;
    var updates;
    var lines;

    if (!topic) {
      setAiOutput('No active topic is available to analyze.');
      return;
    }

    health = topicHealth(topic);
    updates = updatesForTopic(topic.sys_id).slice(0, 3);
    lines = [
      'Topic analysis: ' + displayOf(topic.u_name),
      '',
      'Health score: ' + health.score + '/100',
      'Area: ' + (displayOf(topic.u_area) || 'General'),
      'Due signal: ' + health.due.label,
      'Open to-dos: ' + health.openTodos,
      'Latest status: ' + (statusLabels[health.status] || health.status),
      '',
      'What stands out:'
    ];

    if (health.status === 'blocked') {
      lines.push('- Latest update is blocked. Resolve or document the blocker first.');
    }

    if (health.due.className === 'du-signal-danger') {
      lines.push('- Due date is overdue. Reconfirm the date or create a recovery step.');
    }

    if (health.openTodos > 0) {
      lines.push('- There are open to-dos. Pick one concrete item for the next update.');
    }

    if (!updates.length) {
      lines.push('- No updates have been logged yet. Add a baseline update today.');
    } else {
      lines.push('- Recent updates show ' + updates.length + ' saved signal' + (updates.length === 1 ? '' : 's') + ' for this topic.');
    }

    lines.push('', 'Recommended next move:', aiNextStepForTopic(topic));
    setAiOutput(lines.join('\n'));
  }

  function aiNextStepForTopic(topic) {
    var health = topicHealth(topic);
    var todos = todosOf(topic).filter(function(todo) {
      return !todo.done;
    });
    var latest = health.latest;

    if (latest && displayOf(latest.u_blockers)) {
      return 'Unblock: ' + displayOf(latest.u_blockers);
    }

    if (todos.length) {
      return 'Work the next open to-do: ' + todos[0].text;
    }

    if (latest && displayOf(latest.u_next_step)) {
      return displayOf(latest.u_next_step);
    }

    if (health.due.className === 'du-signal-danger' || health.due.className === 'du-signal-warning') {
      return 'Update the due-date plan and log the next concrete delivery step.';
    }

    return 'Log today\'s progress and define the next smallest useful action.';
  }

  function aiDraftUpdate() {
    var topic = selectedAiTopic();
    var notesField = byId('du-ai-notes');
    var notes = notesField ? notesField.value : '';
    var parts = sentenceParts(notes);
    var blockers = parts.filter(function(part) {
      return /block|stuck|waiting|issue|risk|delay|error|fail/i.test(part);
    });
    var next = parts.filter(function(part) {
      return /next|tomorrow|follow|need|plan|will|todo|action/i.test(part);
    });
    var progress = parts.filter(function(part) {
      return blockers.indexOf(part) === -1 && next.indexOf(part) === -1;
    });
    var status = blockers.length ? 'Blocked' : next.length ? 'Watching' : 'On track';
    var confidence = blockers.length ? '55' : progress.length ? '75' : '70';
    var topicName = topic ? displayOf(topic.u_name) : 'Selected topic';

    if (!parts.length && topic) {
      progress = updatesForTopic(topic.sys_id).slice(0, 2).map(function(update) {
        return displayOf(update.u_progress) || displayOf(update.u_focus);
      }).filter(Boolean);
      next = [aiNextStepForTopic(topic)];
    }

    setAiOutput([
      'Draft daily update for: ' + topicName,
      '',
      'Focus: ' + (progress[0] || next[0] || 'Daily progress'),
      'Status: ' + status,
      'Confidence: ' + confidence + '%',
      '',
      'Progress:',
      progress.length ? progress.map(function(item) { return '- ' + item; }).join('\n') : '- Add what changed today.',
      '',
      'Blockers:',
      blockers.length ? blockers.map(function(item) { return '- ' + item; }).join('\n') : '- None noted.',
      '',
      'Next step:',
      next.length ? next.map(function(item) { return '- ' + item; }).join('\n') : '- Decide the next small action.',
      '',
      'Tags: ai-draft'
    ].join('\n'));
  }

  function aiSuggestNextSteps() {
    var aiTopic = byId('du-ai-topic');
    var topics = aiTopic && aiTopic.value ? [selectedAiTopic()] : activeTopics().slice(0, 8);
    var lines = ['Suggested next steps', ''];

    topics.filter(Boolean).forEach(function(topic) {
      lines.push('- ' + displayOf(topic.u_name) + ': ' + aiNextStepForTopic(topic));
    });

    if (lines.length === 2) {
      lines.push('- No active topics found.');
    }

    setAiOutput(lines.join('\n'));
  }

  function aiRiskRadar() {
    var risky = activeTopics().map(function(topic) {
      return {
        topic: topic,
        health: topicHealth(topic)
      };
    }).filter(function(item) {
      return item.health.score < 75;
    }).sort(function(a, b) {
      return a.health.score - b.health.score;
    }).slice(0, 8);
    var lines = ['Risk radar', ''];

    if (!risky.length) {
      lines.push('No major risk signals found in active topics.');
    } else {
      risky.forEach(function(item) {
        lines.push('- ' + displayOf(item.topic.u_name) + ' (' + item.health.score + '/100): ' + item.health.due.label + ', ' + item.health.openTodos + ' open to-dos, latest status ' + (statusLabels[item.health.status] || item.health.status) + '.');
      });
    }

    setAiOutput(lines.join('\n'));
  }

  function aiWeeklyNarrative() {
    var now = today();
    var weekStart = addDays(now, -6);
    var weekUpdates = state.updates.filter(function(update) {
      return isWithin(valueOf(update.u_update_date), weekStart, now);
    });
    var completed = weekUpdates.filter(function(update) {
      return valueOf(update.u_status) === 'complete';
    });
    var blocked = weekUpdates.filter(function(update) {
      return valueOf(update.u_status) === 'blocked';
    });
    var watching = weekUpdates.filter(function(update) {
      return valueOf(update.u_status) === 'watching';
    });
    var lines = [
      'Weekly narrative',
      '',
      'This week covered ' + weekUpdates.length + ' update' + (weekUpdates.length === 1 ? '' : 's') + ' across ' + activeTopics().length + ' active topic' + (activeTopics().length === 1 ? '' : 's') + '.'
    ];

    if (completed.length) {
      lines.push('Completed work appeared in ' + completed.length + ' update' + (completed.length === 1 ? '' : 's') + '.');
    }

    if (watching.length) {
      lines.push(watching.length + ' update' + (watching.length === 1 ? ' needs' : 's need') + ' monitoring.');
    }

    if (blocked.length) {
      lines.push(blocked.length + ' update' + (blocked.length === 1 ? ' is' : 's are') + ' blocked and should be reviewed first.');
    }

    lines.push('', 'Priority for the next check-in:', activeTopics().slice(0, 5).map(function(topic) {
      return '- ' + displayOf(topic.u_name) + ': ' + aiNextStepForTopic(topic);
    }).join('\n') || '- Add active topics and updates to build a narrative.');

    setAiOutput(lines.join('\n'));
  }

  function handleAiAction(event) {
    var tab = event.target.closest('[data-ai-helper-mode]');
    var button = event.target.closest('[data-ai-action]');

    if (tab) {
      state.aiHelperMode = tab.getAttribute('data-ai-helper-mode') === 'assist' ? 'assist' : 'meeting';
      renderAiHelperMode();
      return;
    }

    if (!button) {
      return;
    }

    if (button.getAttribute('data-ai-action') === 'analyze-topic') {
      aiAnalyzeTopic();
      return;
    }

    if (button.getAttribute('data-ai-action') === 'draft-update') {
      aiDraftUpdate();
      return;
    }

    if (button.getAttribute('data-ai-action') === 'next-steps') {
      aiSuggestNextSteps();
      return;
    }

    if (button.getAttribute('data-ai-action') === 'risk-radar') {
      aiRiskRadar();
      return;
    }

    if (button.getAttribute('data-ai-action') === 'weekly-summary') {
      aiWeeklyNarrative();
    }
  }

  function copyAiOutput() {
    var output = byId('du-ai-output');
    var text = output ? output.textContent || '' : '';

    if (!text.trim()) {
      notify('No AI Helper output to copy.');
      return;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(function() {
          notify('AI Helper output copied.');
        })
        .catch(function() {
          notify('Copy failed. Select the output manually.');
        });
      return;
    }

    notify('Select the output text and copy it manually.');
  }

  function copyDailyBrief() {
    var text = dailyBriefText();

    if (!text.trim()) {
      notify('No Daily Brief content to copy.');
      return;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(function() {
          notify('Daily Brief copied.');
        })
        .catch(function() {
          notify('Copy failed. Use Export week or select the brief manually.');
        });
      return;
    }

    notify('Select the brief text and copy it manually.');
  }

  function useAiDraftAsUpdate() {
    var topic = selectedAiTopic();
    var outputElement = byId('du-ai-output');
    var output = outputElement ? outputElement.textContent || '' : '';

    if (!topic) {
      notify('Choose a topic first.');
      return;
    }

    saveSelectedTopic(topic.sys_id);

    if (!hasPage('workspace')) {
      setSessionValue(PENDING_AI_DRAFT_KEY, output);
      showPage('workspace');
      return;
    }

    showPage('workspace');

    if (byId('du-progress') && byId('du-focus')) {
      byId('du-progress').value = output;
      byId('du-focus').value = 'AI assisted update';
      if (byId('du-tags') && byId('du-related-todo')) {
        byId('du-tags').value = tagsWithRelatedTodo('ai-assisted', byId('du-related-todo').value);
      }
      notify('AI Helper output placed in Workspace.');
    }
  }

  function renderUsersPage() {
    var list = byId('du-profile-list');
    var generated = byId('du-generated-key');

    if (!list || !generated) {
      return;
    }

    if (!state.connection.isAdmin) {
      list.innerHTML = '<div class="du-empty">Connect with an admin API key to manage users.</div>';
      generated.hidden = true;
      generated.innerHTML = '';
      return;
    }

    if (state.generatedApiKey) {
      generated.hidden = false;
      generated.innerHTML = [
        '<span class="du-eyebrow">One-time API key</span>',
        '<p>Share this key with ' + escapeHtml(state.generatedApiKey.profileName || 'the user') + '. It will not be shown again, and any older key for this user was removed.</p>',
        '<code>' + escapeHtml(state.generatedApiKey.key) + '</code>',
        '<div class="du-card-actions">',
        '<button class="du-link-btn" type="button" data-action="copy-generated-key">Copy key</button>',
        '<button class="du-link-btn" type="button" data-action="dismiss-generated-key">Dismiss</button>',
        '</div>'
      ].join('');
    } else {
      generated.hidden = true;
      generated.innerHTML = '';
    }

    if (!state.profiles.length) {
      list.innerHTML = '<div class="du-empty">No profiles found.</div>';
      return;
    }

    list.innerHTML = state.profiles.map(profileCard).join('');
  }

  function profileCard(profile) {
    var active = String(valueOf(profile.u_active)).toLowerCase() !== 'false';
    var keys = profile.api_keys || [];
    var isCurrentProfile = state.connection.profile && state.connection.profile.sys_id === profile.sys_id;
    var keySummary = keys.length ? keys.map(function(key) {
      return [
        '<div class="du-key-row">',
        '<span>',
        '<strong>' + escapeHtml(displayOf(key.u_key_label) || 'API key') + '</strong>',
        '<small>' + escapeHtml((valueOf(key.u_last_used) ? 'Last used ' + valueOf(key.u_last_used) : 'Never used') + (valueOf(key.u_expires_on) ? ' - Expires ' + valueOf(key.u_expires_on) : '')) + '</small>',
        '</span>',
        '<span class="du-topic-state ' + (String(valueOf(key.u_active)).toLowerCase() === 'true' ? 'du-topic-state-active' : 'du-topic-state-inactive') + '">' + (String(valueOf(key.u_active)).toLowerCase() === 'true' ? 'Active' : 'Inactive') + '</span>',
        String(valueOf(key.u_active)).toLowerCase() === 'true' ? '<button class="du-link-btn du-danger-text" type="button" data-action="deactivate-api-key" data-key="' + key.sys_id + '">Deactivate</button>' : '',
        '</div>'
      ].join('');
    }).join('') : '<div class="du-todo-empty">No API keys yet.</div>';
    var keyButtonText = keys.length ? 'Replace API key' : 'Generate API key';

    return [
      '<article class="du-topic-card">',
      '<div class="du-card-head">',
      '<div>',
      '<h3>' + escapeHtml(displayOf(profile.u_name)) + (profile.is_admin ? ' <span class="du-signal du-signal-warning">Admin</span>' : '') + '</h3>',
      '<p>' + escapeHtml(displayOf(profile.u_email)) + '</p>',
      '</div>',
      '<span class="du-topic-state ' + (active ? 'du-topic-state-active' : 'du-topic-state-inactive') + '">' + (active ? 'Active' : 'Inactive') + '</span>',
      '</div>',
      displayOf(profile.u_notes) ? '<p class="du-notes">' + linkifyText(displayOf(profile.u_notes)) + '</p>' : '',
      '<div class="du-key-list">' + keySummary + '</div>',
      '<div class="du-card-actions">',
      '<button class="du-link-btn" type="button" data-action="edit-profile" data-profile="' + profile.sys_id + '">Edit</button>',
      '<button class="du-link-btn" type="button" data-action="generate-api-key" data-profile="' + profile.sys_id + '">' + keyButtonText + '</button>',
      isCurrentProfile ? '' : '<button class="du-link-btn du-danger-text" type="button" data-action="delete-profile" data-profile="' + profile.sys_id + '">Remove user</button>',
      '</div>',
      '</article>'
    ].join('');
  }

  function thoughtCard(thought) {
    var important = String(valueOf(thought.u_important)).toLowerCase() === 'true';
    var note = displayOf(thought.u_note) || 'No note text.';
    var type = noteTypeFromTags(displayOf(thought.u_tags));
    var tags = tagsWithoutNoteType(displayOf(thought.u_tags));

    return [
      '<article class="du-update-card' + (important ? ' is-important' : '') + '">',
      '<div class="du-card-head">',
      '<div>',
      '<div class="du-topic-title-line">',
      important ? '<span class="du-important-icon is-important" title="Important">&#9733;</span>' : '',
      '<h3>' + escapeHtml(displayOf(thought.u_title) || 'Note') + '</h3>',
      '</div>',
      '<p>' + escapeHtml(valueOf(thought.u_note_date) || '') + '</p>',
      '</div>',
      '<div class="du-topic-badges">',
      '<span class="du-status du-status-paused">' + escapeHtml(noteTypeLabels[type]) + '</span>',
      important ? '<span class="du-status du-status-watching">Important</span>' : '',
      '</div>',
      '</div>',
      '<p class="du-update-text">' + linkifyText(note) + '</p>',
      tags ? '<p class="du-tags">' + escapeHtml(tags) + '</p>' : '',
      '<div class="du-card-actions">',
      '<button class="du-link-btn" type="button" data-action="edit-thought" data-thought="' + thought.sys_id + '">Edit</button>',
      '<button class="du-link-btn du-danger-text" type="button" data-action="delete-thought" data-thought="' + thought.sys_id + '">Delete</button>',
      '</div>',
      '</article>'
    ].join('');
  }

  function updateDetailSection(label, text) {
    if (!String(text || '').trim()) {
      return '';
    }

    return [
      '<section class="du-update-detail-section">',
      '<span>' + escapeHtml(label) + '</span>',
      '<p class="du-update-text">' + linkifyText(text) + '</p>',
      '</section>'
    ].join('');
  }

  function updateCard(update) {
    var status = valueOf(update.u_status) || 'on_track';
    var progress = displayOf(update.u_progress);
    var blockers = displayOf(update.u_blockers);
    var nextStep = displayOf(update.u_next_step);
    var relatedTodo = relatedTodoFromTags(displayOf(update.u_tags));
    var tags = tagsWithoutRelatedTodo(displayOf(update.u_tags));
    var details = [
      updateDetailSection('Progress', progress),
      updateDetailSection('Blockers', blockers),
      updateDetailSection('Next step', nextStep)
    ].join('') || '<div class="du-todo-empty">No update details were saved.</div>';

    return [
      '<article class="du-update-card">',
      '<div class="du-card-head">',
      '<div>',
      '<h3>' + escapeHtml(displayOf(update.u_focus) || 'Daily update') + '</h3>',
      '<p>' + escapeHtml(displayOf(update.u_topic)) + ' - ' + escapeHtml(updateType(update)) + ' - ' + escapeHtml(valueOf(update.u_update_date)) + ' - ' + escapeHtml(valueOf(update.u_confidence) || '70') + '% confidence</p>',
      '</div>',
      '<span class="du-status ' + statusClass(status) + '">' + escapeHtml(statusLabels[status] || status) + '</span>',
      '</div>',
      '<div class="du-update-detail-list">' + details + '</div>',
      relatedTodo ? '<p class="du-tags">Related to-do: ' + escapeHtml(relatedTodo) + '</p>' : '',
      tags ? '<p class="du-tags">' + escapeHtml(tags) + '</p>' : '',
      '<div class="du-card-actions">',
      '<button class="du-link-btn" type="button" data-action="open-update" data-update="' + update.sys_id + '">Edit in Workspace</button>',
      '<button class="du-link-btn du-danger-text" type="button" data-action="delete-update" data-update="' + update.sys_id + '">Delete</button>',
      '</div>',
      '</article>'
    ].join('');
  }

  function resetTopicForm() {
    state.topicEditId = '';
    state.topicEditMode = true;
    saveSelectedTopic('');

    if (!byId('du-topic-form')) {
      return;
    }

    byId('du-topic-id').value = '';
    byId('du-topic-name').value = '';
    byId('du-topic-context').value = 'Other';
    byId('du-topic-type').value = 'Technical';
    byId('du-topic-area').value = '';
    byId('du-topic-due-date').value = '';
    byId('du-topic-active').checked = true;
    byId('du-topic-important').checked = false;
    byId('du-topic-notes').value = '';
    byId('du-topic-submit-label').textContent = 'Save topic';
    renderLinkedTextPreviews();

    if (byId('du-topic-detail-title')) {
      byId('du-topic-detail-title').textContent = 'New topic';
    }

    if (byId('du-topic-detail-actions')) {
      byId('du-topic-detail-actions').innerHTML = '';
    }

    setTopicEditorVisible(true);
    renderTopicDetailSummary(null);
    renderTopicUpdateHistory(null);
    renderTopicFormTodos();
  }

  function populateTopicForm(topic) {
    if (!topic || !byId('du-topic-form')) {
      return;
    }

    state.topicEditId = topic.sys_id;
    state.topicEditMode = true;
    saveSelectedTopic(topic.sys_id);
    byId('du-topic-id').value = topic.sys_id;
    byId('du-topic-name').value = displayOf(topic.u_name);
    byId('du-topic-context').value = topicContext(topic);
    byId('du-topic-type').value = topicType(topic);
    byId('du-topic-area').value = displayOf(topic.u_area);
    byId('du-topic-due-date').value = valueOf(topic.u_due_date);
    byId('du-topic-active').checked = isActive(topic);
    byId('du-topic-important').checked = isImportant(topic);
    byId('du-topic-notes').value = displayOf(topic.u_notes);
    byId('du-topic-submit-label').textContent = 'Update topic';
    renderLinkedTextPreviews();

    if (byId('du-topic-detail-title')) {
      byId('du-topic-detail-title').textContent = 'Topic details';
    }

    if (byId('du-topic-detail-actions')) {
      byId('du-topic-detail-actions').innerHTML = [
        '<button class="du-link-btn" type="button" data-action="' + (isActive(topic) ? 'deactivate-topic' : 'activate-topic') + '" data-topic="' + topic.sys_id + '">' + (isActive(topic) ? 'Mark inactive' : 'Mark active') + '</button>',
        '<button class="du-link-btn du-danger-text" type="button" data-action="delete-topic" data-topic="' + topic.sys_id + '">Delete topic</button>'
      ].join('');
    }

    setTopicEditorVisible(true);
    renderTopicDetailSummary(topic);
    renderTopicUpdateHistory(topic);
  }

  function editTopic(topic) {
    state.page = 'topics';
    populateTopicForm(topic);
    renderPage();

    if (byId('du-topic-name')) {
      byId('du-topic-name').focus();
    }
  }

  function openTopicDetail(topic) {
    saveSelectedTopic(topic.sys_id);
    state.topicEditId = '';
    state.topicEditMode = false;

    if (!hasPage('topics')) {
      openTopicsWithFilters({ state: isActive(topic) ? 'active' : '', topic: topic.sys_id });
      return;
    }

    state.page = 'topics';
    renderPage();
  }

  function saveTopic(event) {
    event.preventDefault();

    var payload = {
      sys_id: byId('du-topic-id').value,
      u_name: byId('du-topic-name').value.trim(),
      u_context: byId('du-topic-context').value,
      u_type: byId('du-topic-type').value,
      u_area: byId('du-topic-area').value.trim(),
      u_due_date: byId('du-topic-due-date').value || '',
      u_active: byId('du-topic-active').checked ? 'true' : 'false',
      u_important: byId('du-topic-important').checked ? 'true' : 'false',
      u_notes: byId('du-topic-notes').value.trim()
    };

    api('saveTopic', payload)
      .then(function(topic) {
        notify(payload.sys_id ? 'Topic updated.' : 'Topic created.');
        state.topicEditId = '';
        state.topicEditMode = false;
        saveSelectedTopic(topic.sys_id);
        return loadAll();
      })
      .catch(function(error) {
        notify('Could not save topic: ' + error.message);
        console.error(error);
      });
  }

  function setTopicActive(topic, active) {
    api('saveTopic', {
      sys_id: topic.sys_id,
      u_name: displayOf(topic.u_name),
      u_context: topicContext(topic),
      u_type: topicType(topic),
      u_area: displayOf(topic.u_area),
      u_due_date: valueOf(topic.u_due_date),
      u_active: active ? 'true' : 'false',
      u_important: isImportant(topic) ? 'true' : 'false',
      u_priority: valueOf(topic.u_priority),
      u_notes: displayOf(topic.u_notes)
    })
      .then(function() {
        notify(active ? 'Topic marked active.' : 'Topic marked inactive.');

        if (!active && state.selectedTopic === topic.sys_id) {
          saveSelectedTopic('');
        }

        return loadAll();
      })
      .catch(function(error) {
        notify('Could not change topic: ' + error.message);
        console.error(error);
      });
  }

  function setTopicImportant(topic, important) {
    api('saveTopic', {
      sys_id: topic.sys_id,
      u_name: displayOf(topic.u_name),
      u_context: topicContext(topic),
      u_type: topicType(topic),
      u_area: displayOf(topic.u_area),
      u_due_date: valueOf(topic.u_due_date),
      u_active: isActive(topic) ? 'true' : 'false',
      u_important: important ? 'true' : 'false',
      u_priority: valueOf(topic.u_priority),
      u_notes: displayOf(topic.u_notes)
    })
      .then(function() {
        notify(important ? 'Topic marked important.' : 'Topic importance removed.');
        return loadAll();
      })
      .catch(function(error) {
        notify('Could not change importance: ' + error.message);
        console.error(error);
      });
  }

  function deleteTopic(topic) {
    var label = displayOf(topic.u_name) || 'this topic';

    if (!window.confirm('Delete ' + label + ' and all of its updates?')) {
      return;
    }

    api('deleteTopic', { sys_id: topic.sys_id })
      .then(function() {
        notify('Topic deleted.');

        if (state.selectedTopic === topic.sys_id) {
          saveSelectedTopic('');
        }

        if (state.topicEditId === topic.sys_id) {
          resetTopicForm();
        }

        return loadAll();
      })
      .catch(function(error) {
        notify('Could not delete topic: ' + error.message);
        console.error(error);
      });
  }

  function saveTopicTodos(topic, todos, message) {
    return api('saveTopicTodos', {
      sys_id: topic.sys_id,
      todos: todos
    })
      .then(function(updatedTopic) {
        replaceTopicInState(updatedTopic);

        renderTopicOptions();
        renderPage();
        notify(message || 'To-do list updated.');
        return updatedTopic;
      })
      .catch(function(error) {
        notify('Could not update to-dos: ' + error.message);
        console.error(error);
        throw error;
      });
  }

  function addTopicTodo(topic, text) {
    var todos = todosOf(topic);
    var value = String(text || '').trim();

    if (!value) {
      notify('Enter a to-do item first.');
      return;
    }

    todos.push({ text: value, done: false });
    saveTopicTodos(topic, todos, 'To-do added.');
  }

  function toggleTopicTodo(topic, index, done) {
    var todos = todosOf(topic);

    if (!todos[index]) {
      return;
    }

    todos[index].done = done;
    saveTopicTodos(topic, todos, 'To-do updated.');
  }

  function deleteTopicTodo(topic, index) {
    var todos = todosOf(topic);

    if (!todos[index]) {
      return;
    }

    todos.splice(index, 1);
    saveTopicTodos(topic, todos, 'To-do removed.');
  }

  function saveTopicOrder(orderedTopicIds) {
    api('saveTopicOrder', { ordered_topics: orderedTopicIds })
      .then(function(topics) {
        state.topics = topics || state.topics;
        renderTopicOptions();
        renderPage();
        notify('Topic priority updated.');
      })
      .catch(function(error) {
        notify('Could not update priority: ' + error.message);
        console.error(error);
        loadAll();
      });
  }

  function saveUpdate(event) {
    event.preventDefault();

    var confidence = parseInt(byId('du-confidence').value, 10);

    if (isNaN(confidence)) {
      confidence = 70;
    }

    if (confidence < 0 || confidence > 100) {
      notify('Confidence must be between 0 and 100.');
      return;
    }

    var payload = {
      sys_id: byId('du-update-id').value,
      u_topic: byId('du-update-topic').value,
      u_update_date: byId('du-update-date').value || today(),
      u_focus: byId('du-focus').value.trim(),
      u_status: byId('du-status').value,
      u_type: byId('du-update-type') ? byId('du-update-type').value : 'Technical',
      u_progress: byId('du-progress').value.trim(),
      u_blockers: byId('du-blockers').value.trim(),
      u_next_step: byId('du-next-step').value.trim(),
      u_confidence: String(confidence),
      u_tags: tagsWithRelatedTodo(byId('du-tags').value.trim(), byId('du-related-todo').value)
    };

    api('saveUpdate', payload)
      .then(function(update) {
        notify(payload.sys_id ? 'Update changed.' : 'Update saved.');
        saveSelectedTopic(valueOf(update.u_topic));
        return loadAll();
      })
      .catch(function(error) {
        notify('Could not save update: ' + error.message);
        console.error(error);
      });
  }

  function saveQuickUpdate(event) {
    var topicId = byId('du-quick-topic').value;
    var quickDate = byId('du-quick-date').value || today();
    var focus = byId('du-quick-focus').value.trim();
    var progress = byId('du-quick-progress').value.trim();
    var existing;
    var payload;

    event.preventDefault();

    if (!topicId) {
      notify('Choose a topic for the quick update.');
      return;
    }

    if (!focus && !progress) {
      notify('Add a focus or progress note first.');
      return;
    }

    existing = updateForTopicDate(topicId, quickDate);
    payload = {
      sys_id: existing ? existing.sys_id : '',
      u_topic: topicId,
      u_update_date: quickDate,
      u_focus: focus || (existing ? displayOf(existing.u_focus) : 'Quick update'),
      u_status: byId('du-quick-status').value,
      u_type: byId('du-quick-type') ? byId('du-quick-type').value : (topicById(topicId) ? topicType(topicById(topicId)) : 'Technical'),
      u_progress: progress || (existing ? displayOf(existing.u_progress) : ''),
      u_blockers: existing ? displayOf(existing.u_blockers) : '',
      u_next_step: existing ? displayOf(existing.u_next_step) : '',
      u_confidence: existing ? String(valueOf(existing.u_confidence) || '70') : '70',
      u_tags: existing ? displayOf(existing.u_tags) : 'quick'
    };

    api('saveUpdate', payload)
      .then(function(update) {
        notify(existing ? 'Quick update merged into today.' : 'Quick update saved.');
        saveSelectedTopic(valueOf(update.u_topic));
        byId('du-quick-focus').value = '';
        byId('du-quick-progress').value = '';
        byId('du-quick-status').value = 'on_track';
        if (byId('du-quick-type')) {
          byId('du-quick-type').value = topicById(topicId) ? topicType(topicById(topicId)) : 'Technical';
        }
        return loadAll();
      })
      .catch(function(error) {
        notify('Could not save quick update: ' + error.message);
        console.error(error);
      });
  }

  function testConnection(closeWhenDone) {
    saveConnection(connectionFromForm(null, false));

    return api('ping', {})
      .then(function(result) {
        var profile = normalizeProfile(result && result.profile);
        saveConnection(connectionFromForm(profile, result && result.is_admin === true));
        notify(profileName(profile) ? 'Connected as ' + profileName(profile) + '.' : 'Connection works.');

        if (closeWhenDone) {
          showSettings(false);
          return loadAll();
        }

        return result;
      })
      .catch(function(error) {
        saveConnection(connectionFromForm(null));
        notify('Connection failed: ' + error.message);
        throw error;
      });
  }

  function showConnectionPanel(panel) {
    var isRegister = panel === 'register';
    byId('du-register-form').hidden = !isRegister;
    byId('du-existing-connection-panel').hidden = isRegister;
    byId('du-register-tab').classList.toggle('is-selected', isRegister);
    byId('du-connect-existing-tab').classList.toggle('is-selected', !isRegister);
  }

  function renderRegistrationKey() {
    var container = byId('du-registration-key');

    if (!state.registrationApiKey) {
      container.hidden = true;
      container.innerHTML = '';
      return;
    }

    container.hidden = false;
    container.innerHTML = [
      '<span class="du-eyebrow">Registration complete</span>',
      '<p>Copy this key now. It is saved as a hash in Cloudflare and will not be shown again.</p>',
      '<code>' + escapeHtml(state.registrationApiKey) + '</code>',
      '<div class="du-card-actions">',
      '<button class="du-link-btn" type="button" data-action="copy-registration-key">Copy key</button>',
      '<button class="du-link-btn" type="button" data-action="use-registration-key">Use this key</button>',
      '<button class="du-link-btn" type="button" data-action="dismiss-registration-key">Dismiss</button>',
      '</div>'
    ].join('');
  }

  function selfRegister(event) {
    event.preventDefault();

    publicApi('selfRegister', {
      u_name: byId('du-register-name').value.trim(),
      u_email: byId('du-register-email').value.trim(),
      registration_code: byId('du-register-code').value.trim(),
      u_key_label: 'Self-service browser key'
    })
      .then(function(result) {
        state.registrationApiKey = result.api_key || '';
        byId('du-api-key').value = state.registrationApiKey;
        saveConnection({
          instanceUrl: byId('du-instance-url').value,
          apiPath: byId('du-api-path').value,
          apiKey: state.registrationApiKey,
          profile: normalizeProfile(result.profile),
          isAdmin: false
        });
        renderRegistrationKey();
        showConnectionPanel('existing');
        notify('Registration complete. Your API key is ready.');
        return loadAll();
      })
      .catch(function(error) {
        notify('Registration failed: ' + error.message);
        console.error(error);
      });
  }

  function handleRegistrationKeyClick(event) {
    var button = event.target.closest('[data-action]');

    if (!button) {
      return;
    }

    if (button.getAttribute('data-action') === 'copy-registration-key') {
      if (navigator.clipboard && navigator.clipboard.writeText && state.registrationApiKey) {
        navigator.clipboard.writeText(state.registrationApiKey)
          .then(function() {
            notify('Registration key copied.');
          })
          .catch(function() {
            notify('Copy failed. Select the key text manually.');
          });
      }
      return;
    }

    if (button.getAttribute('data-action') === 'use-registration-key') {
      byId('du-api-key').value = state.registrationApiKey || '';
      showConnectionPanel('existing');
      testConnection(true).catch(function() {});
      return;
    }

    if (button.getAttribute('data-action') === 'dismiss-registration-key') {
      state.registrationApiKey = null;
      renderRegistrationKey();
    }
  }

  function openUpdate(update) {
    saveSelectedTopic(valueOf(update.u_topic));
    setSessionValue(PENDING_UPDATE_ID_KEY, update.sys_id);
    setSessionValue(PENDING_UPDATE_DATE_KEY, valueOf(update.u_update_date) || today());

    if (!hasPage('workspace')) {
      showPage('workspace');
      return;
    }

    if (byId('du-update-date')) {
      byId('du-update-date').value = valueOf(update.u_update_date) || today();
    }

    showPage('workspace');
  }

  function deleteUpdate(updateId) {
    var update = updateById(updateId);
    var label = update ? displayOf(update.u_focus) || valueOf(update.u_update_date) : 'this update';

    if (!window.confirm('Delete ' + label + '?')) {
      return;
    }

    api('deleteUpdate', { sys_id: updateId })
      .then(function() {
        notify('Update deleted.');
        return loadAll();
      })
      .catch(function(error) {
        notify('Could not delete update: ' + error.message);
        console.error(error);
      });
  }

  function resetThoughtForm() {
    state.thoughtEditId = '';
    byId('du-thought-id').value = '';
    byId('du-thought-date').value = today();
    byId('du-thought-title').value = '';
    byId('du-thought-note').value = '';
    byId('du-thought-type').value = 'thought';
    byId('du-thought-tags').value = '';
    byId('du-thought-important').checked = false;
    byId('du-thought-submit-label').textContent = 'Save note';
    renderLinkedTextPreviews();
  }

  function editThought(thought) {
    state.page = 'notes';
    state.thoughtEditId = thought.sys_id;
    byId('du-thought-id').value = thought.sys_id;
    byId('du-thought-date').value = valueOf(thought.u_note_date) || today();
    byId('du-thought-title').value = displayOf(thought.u_title);
    byId('du-thought-note').value = displayOf(thought.u_note);
    byId('du-thought-type').value = noteTypeFromTags(displayOf(thought.u_tags));
    byId('du-thought-tags').value = tagsWithoutNoteType(displayOf(thought.u_tags));
    byId('du-thought-important').checked = String(valueOf(thought.u_important)).toLowerCase() === 'true';
    byId('du-thought-submit-label').textContent = 'Update note';
    renderLinkedTextPreviews();
    renderPage();
    byId('du-thought-title').focus();
  }

  function saveThought(event) {
    event.preventDefault();

    var payload = {
      sys_id: byId('du-thought-id').value,
      u_note_date: byId('du-thought-date').value || today(),
      u_title: byId('du-thought-title').value.trim(),
      u_note: byId('du-thought-note').value.trim(),
      u_tags: tagsWithNoteType(byId('du-thought-tags').value.trim(), byId('du-thought-type').value),
      u_important: byId('du-thought-important').checked ? 'true' : 'false'
    };

    api('saveThought', payload)
      .then(function() {
        notify(payload.sys_id ? 'Note updated.' : 'Note saved.');
        resetThoughtForm();
        return loadAll();
      })
      .catch(function(error) {
        notify('Could not save note: ' + error.message);
        console.error(error);
      });
  }

  function deleteThought(thoughtId) {
    var thought = thoughtById(thoughtId);
    var label = thought ? displayOf(thought.u_title) || valueOf(thought.u_note_date) : 'this note';

    if (!window.confirm('Delete ' + label + '?')) {
      return;
    }

    api('deleteThought', { sys_id: thoughtId })
      .then(function() {
        notify('Note deleted.');

        if (state.thoughtEditId === thoughtId) {
          resetThoughtForm();
        }

        return loadAll();
      })
      .catch(function(error) {
        notify('Could not delete note: ' + error.message);
        console.error(error);
      });
  }

  function resetProfileForm() {
    state.profileEditId = '';
    byId('du-profile-id').value = '';
    byId('du-profile-name').value = '';
    byId('du-profile-email').value = '';
    byId('du-profile-active').checked = true;
    byId('du-profile-notes').value = '';
    byId('du-profile-submit-label').textContent = 'Save user';
  }

  function editProfile(profile) {
    state.page = 'users';
    state.profileEditId = profile.sys_id;
    byId('du-profile-id').value = profile.sys_id;
    byId('du-profile-name').value = displayOf(profile.u_name);
    byId('du-profile-email').value = displayOf(profile.u_email);
    byId('du-profile-active').checked = String(valueOf(profile.u_active)).toLowerCase() !== 'false';
    byId('du-profile-notes').value = displayOf(profile.u_notes);
    byId('du-profile-submit-label').textContent = 'Update user';
    renderPage();
    byId('du-profile-name').focus();
  }

  function saveProfile(event) {
    event.preventDefault();

    var payload = {
      sys_id: byId('du-profile-id').value,
      u_name: byId('du-profile-name').value.trim(),
      u_email: byId('du-profile-email').value.trim(),
      u_active: byId('du-profile-active').checked ? 'true' : 'false',
      u_notes: byId('du-profile-notes').value.trim()
    };

    api('saveProfile', payload)
      .then(function() {
        notify(payload.sys_id ? 'User updated.' : 'User created.');
        resetProfileForm();
        return loadAll();
      })
      .catch(function(error) {
        notify('Could not save user: ' + error.message);
        console.error(error);
      });
  }

  function generateProfileApiKey(profile) {
    var label = window.prompt('API key label', 'Standalone page key');

    if (label === null) {
      return;
    }

    if ((profile.api_keys || []).length && !window.confirm('Generate a new API key for ' + displayOf(profile.u_name) + '? The existing key for this user will be removed.')) {
      return;
    }

    api('createProfileApiKey', {
      profile_sys_id: profile.sys_id,
      u_key_label: String(label || 'Standalone page key').trim()
    })
      .then(function(result) {
        state.generatedApiKey = {
          key: result.api_key,
          profileName: displayOf(profile.u_name)
        };
        notify('API key generated.');
        return loadAll();
      })
      .catch(function(error) {
        notify('Could not generate API key: ' + error.message);
        console.error(error);
      });
  }

  function deactivateApiKey(keyId) {
    if (!window.confirm('Deactivate this API key? The user will no longer be able to use it.')) {
      return;
    }

    api('deactivateApiKey', { sys_id: keyId })
      .then(function() {
        notify('API key deactivated.');
        return loadAll();
      })
      .catch(function(error) {
        notify('Could not deactivate API key: ' + error.message);
        console.error(error);
      });
  }

  function deleteProfile(profile) {
    var profileName = displayOf(profile.u_name) || displayOf(profile.u_email) || 'this user';

    if (state.connection.profile && state.connection.profile.sys_id === profile.sys_id) {
      notify('You cannot remove the profile currently used by this admin session.');
      return;
    }

    if (!window.confirm('Remove ' + profileName + '? This deletes their topics, updates, notes, and API key.')) {
      return;
    }

    api('deleteProfile', { sys_id: profile.sys_id })
      .then(function() {
        notify('User removed.');
        if (state.profileEditId === profile.sys_id) {
          resetProfileForm();
        }
        return loadAll();
      })
      .catch(function(error) {
        notify('Could not remove user: ' + error.message);
        console.error(error);
      });
  }

  function copyGeneratedKey() {
    if (!state.generatedApiKey || !state.generatedApiKey.key) {
      return;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(state.generatedApiKey.key)
        .then(function() {
          notify('API key copied.');
        })
        .catch(function() {
          notify('Copy failed. Select the key text manually.');
        });
      return;
    }

    notify('Select the key text and copy it manually.');
  }

  function topicRowFromEvent(event) {
    return event.target.closest('.du-topic-row[data-topic]');
  }

  function clearDragClasses() {
    var rows = byId('du-home-topic-list').querySelectorAll('.du-topic-row');
    var i;

    for (i = 0; i < rows.length; i += 1) {
      rows[i].classList.remove('is-drop-target');
      rows[i].classList.remove('is-dragging');
    }
  }

  function orderedActiveTopicIds() {
    return activeTopics().map(function(topic) {
      return topic.sys_id;
    });
  }

  function moveTopicAround(dragTopicId, targetTopicId, placeAfter) {
    var ordered = orderedActiveTopicIds();
    var fromIndex = ordered.indexOf(dragTopicId);
    var toIndex = ordered.indexOf(targetTopicId);
    var moved;

    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
      return ordered;
    }

    moved = ordered.splice(fromIndex, 1)[0];
    toIndex = ordered.indexOf(targetTopicId);

    if (placeAfter) {
      toIndex += 1;
    }

    ordered.splice(toIndex, 0, moved);
    return ordered;
  }

  function handleTodoButton(button, topic) {
    var action = button.getAttribute('data-action');
    var todoIndex;
    var input;

    if (action === 'add-todo') {
      input = button.closest('.du-todo-add').querySelector('.du-todo-input');
      addTopicTodo(topic, input ? input.value : '');
      return true;
    }

    if (action === 'delete-todo') {
      todoIndex = parseInt(button.getAttribute('data-todo'), 10);
      deleteTopicTodo(topic, todoIndex);
      return true;
    }

    return false;
  }

  function handleTodoChange(event) {
    var checkbox = event.target.closest('[data-action="toggle-todo"]');
    var topic;
    var todoIndex;

    if (!checkbox) {
      return;
    }

    topic = topicById(checkbox.getAttribute('data-topic'));

    if (!topic) {
      return;
    }

    todoIndex = parseInt(checkbox.getAttribute('data-todo'), 10);
    toggleTopicTodo(topic, todoIndex, checkbox.checked);
  }

  function handleTodoKeydown(event) {
    var input = event.target.closest('.du-todo-input');
    var topic;

    if (!input || event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    topic = topicById(input.getAttribute('data-topic'));

    if (!topic) {
      return;
    }

    addTopicTodo(topic, input.value);
  }

  function handleTopicAction(event) {
    var button = event.target.closest('[data-action]');
    var topic;

    if (!button) {
      return;
    }

    topic = topicById(button.getAttribute('data-topic'));

    if (!topic) {
      return;
    }

    if (handleTodoButton(button, topic)) {
      return;
    }

    if (button.getAttribute('data-action') === 'toggle-important') {
      setTopicImportant(topic, !isImportant(topic));
      return;
    }

    if (button.getAttribute('data-action') === 'select-home-topic') {
      saveSelectedTopic(topic.sys_id);
      renderHome();
      return;
    }

    if (button.getAttribute('data-action') === 'select-workspace-topic') {
      saveSelectedTopic(topic.sys_id);
      renderWorkspace();
      return;
    }

    if (button.getAttribute('data-action') === 'open-workspace-topic') {
      saveSelectedTopic(topic.sys_id);
      showPage('workspace');
      return;
    }

    if (button.getAttribute('data-action') === 'open-topic-detail') {
      openTopicDetail(topic);
      return;
    }

    if (button.getAttribute('data-action') === 'edit-topic') {
      editTopic(topic);
      return;
    }

    if (button.getAttribute('data-action') === 'deactivate-topic') {
      setTopicActive(topic, false);
      return;
    }

    if (button.getAttribute('data-action') === 'activate-topic') {
      setTopicActive(topic, true);
      return;
    }

    if (button.getAttribute('data-action') === 'delete-topic') {
      deleteTopic(topic);
    }
  }

  function handleUpdateListClick(event) {
    var button = event.target.closest('[data-action]');
    var update;

    if (!button) {
      return;
    }

    update = updateById(button.getAttribute('data-update'));

    if (!update) {
      return;
    }

    if (button.getAttribute('data-action') === 'open-update') {
      openUpdate(update);
      return;
    }

    if (button.getAttribute('data-action') === 'delete-update') {
      deleteUpdate(update.sys_id);
    }
  }

  function handleThoughtListClick(event) {
    var button = event.target.closest('[data-action]');
    var thought;

    if (!button) {
      return;
    }

    thought = thoughtById(button.getAttribute('data-thought'));

    if (!thought) {
      return;
    }

    if (button.getAttribute('data-action') === 'edit-thought') {
      editThought(thought);
      return;
    }

    if (button.getAttribute('data-action') === 'delete-thought') {
      deleteThought(thought.sys_id);
    }
  }

  function handleProfileListClick(event) {
    var button = event.target.closest('[data-action]');
    var action;
    var profile;

    if (!button) {
      return;
    }

    action = button.getAttribute('data-action');

    if (action === 'deactivate-api-key') {
      deactivateApiKey(button.getAttribute('data-key'));
      return;
    }

    profile = profileById(button.getAttribute('data-profile'));

    if (!profile) {
      return;
    }

    if (action === 'edit-profile') {
      editProfile(profile);
      return;
    }

    if (action === 'generate-api-key') {
      generateProfileApiKey(profile);
      return;
    }

    if (action === 'delete-profile') {
      deleteProfile(profile);
    }
  }

  function handleGeneratedKeyClick(event) {
    var button = event.target.closest('[data-action]');

    if (!button) {
      return;
    }

    if (button.getAttribute('data-action') === 'copy-generated-key') {
      copyGeneratedKey();
      return;
    }

    if (button.getAttribute('data-action') === 'dismiss-generated-key') {
      state.generatedApiKey = null;
      renderUsersPage();
    }
  }

  function searchResultItem(type, label, meta, id) {
    return [
      '<button class="du-search-result" type="button" data-result-type="' + type + '" data-result-id="' + id + '">',
      '<span>' + escapeHtml(label) + '</span>',
      '<small>' + escapeHtml(meta) + '</small>',
      '</button>'
    ].join('');
  }

  function searchResults(query) {
    var results = [];

    sortTopics(state.topics).forEach(function(topic) {
      var todos = todosOf(topic);
      var haystack = [
        displayOf(topic.u_name),
        topicContext(topic),
        topicType(topic),
        displayOf(topic.u_area),
        displayOf(topic.u_notes),
        todos.map(function(todo) {
          return todo.text;
        }).join(' ')
      ].join(' ');

      if (textMatch(haystack, query)) {
        results.push(searchResultItem('topic', displayOf(topic.u_name) || 'Topic', 'Topic - ' + (displayOf(topic.u_area) || 'General'), topic.sys_id));
      }

      todos.forEach(function(todo) {
        if (textMatch(todo.text, query)) {
          results.push(searchResultItem('todo', todo.text, 'To-do - ' + (displayOf(topic.u_name) || 'Topic'), topic.sys_id));
        }
      });
    });

    state.updates.forEach(function(update) {
      var topic = topicById(valueOf(update.u_topic));
      var topicName = topic ? displayOf(topic.u_name) : displayOf(update.u_topic);
      var haystack = [
        topicName,
        updateType(update),
        displayOf(update.u_focus),
        displayOf(update.u_progress),
        displayOf(update.u_blockers),
        displayOf(update.u_next_step),
        displayOf(update.u_tags)
      ].join(' ');

      if (textMatch(haystack, query)) {
        results.push(searchResultItem('update', displayOf(update.u_focus) || topicName || 'Daily update', 'Update - ' + updateType(update) + ' - ' + valueOf(update.u_update_date), update.sys_id));
      }
    });

    state.thoughts.forEach(function(thought) {
      var type = noteTypeLabels[noteTypeFromTags(displayOf(thought.u_tags))];
      var haystack = [
        displayOf(thought.u_title),
        displayOf(thought.u_note),
        displayOf(thought.u_tags),
        type
      ].join(' ');

      if (textMatch(haystack, query)) {
        results.push(searchResultItem('thought', displayOf(thought.u_title) || 'Note', type + ' - ' + valueOf(thought.u_note_date), thought.sys_id));
      }
    });

    return results.slice(0, 12);
  }

  function renderGlobalSearchResults() {
    var input = byId('du-global-search');
    var container = byId('du-global-results');
    var query = input.value.trim().toLowerCase();
    var results;

    state.globalSearch = query;

    if (query.length < 2) {
      container.hidden = true;
      container.innerHTML = '';
      return;
    }

    results = searchResults(query);
    container.innerHTML = results.length ? results.join('') : '<div class="du-search-empty">No matching work found.</div>';
    container.hidden = false;
  }

  function clearGlobalSearch() {
    byId('du-global-search').value = '';
    state.globalSearch = '';
    byId('du-global-results').hidden = true;
    byId('du-global-results').innerHTML = '';
  }

  function handleGlobalResultClick(event) {
    var button = event.target.closest('[data-result-type]');
    var type;
    var id;
    var update;
    var thought;

    if (!button) {
      return;
    }

    type = button.getAttribute('data-result-type');
    id = button.getAttribute('data-result-id');

    if (type === 'topic' || type === 'todo') {
      saveSelectedTopic(id);
      openTopicsWithFilters({ topic: id });
      clearGlobalSearch();
      return;
    }

    if (type === 'update') {
      update = updateById(id);

      if (update) {
        openUpdate(update);
        clearGlobalSearch();
      }
      return;
    }

    if (type === 'thought') {
      thought = thoughtById(id);

      if (thought) {
        editThought(thought);
        clearGlobalSearch();
      }
    }
  }

  function downloadText(filename, text) {
    var blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(function() {
      URL.revokeObjectURL(url);
    }, 200);
  }

  function exportWeeklySummary() {
    var now = today();
    var weekStart = addDays(now, -6);
    var active = activeTopics();
    var overdue = active.filter(function(topic) {
      var dueDate = valueOf(topic.u_due_date);
      return dueDate && dueDate < now;
    });
    var dueSoon = active.filter(function(topic) {
      var dueDate = valueOf(topic.u_due_date);
      return dueDate && dueDate >= now && dueDate <= addDays(now, 7);
    });
    var updates = state.updates.filter(function(update) {
      return isWithin(valueOf(update.u_update_date), weekStart, now);
    }).sort(function(a, b) {
      return String(valueOf(a.u_update_date)).localeCompare(String(valueOf(b.u_update_date)));
    });
    var importantNotes = state.thoughts.filter(function(thought) {
      return String(valueOf(thought.u_important)).toLowerCase() === 'true' && isWithin(valueOf(thought.u_note_date), weekStart, now);
    });
    var lines = [
      '# Daily Work Log Weekly Summary',
      '',
      'Period: ' + weekStart + ' to ' + now,
      '',
      '## Snapshot',
      '- Active topics: ' + active.length,
      '- Updates logged: ' + updates.length,
      '- Due soon: ' + dueSoon.length,
      '- Overdue: ' + overdue.length,
      '- Important notes: ' + importantNotes.length,
      '',
      '## Updates'
    ];

    if (!updates.length) {
      lines.push('- No updates logged in this period.');
    } else {
      updates.forEach(function(update) {
        var topic = topicById(valueOf(update.u_topic));
        var topicName = topic ? displayOf(topic.u_name) : displayOf(update.u_topic);
        lines.push('- ' + valueOf(update.u_update_date) + ' [' + (statusLabels[valueOf(update.u_status)] || valueOf(update.u_status)) + ' / ' + updateType(update) + '] ' + topicName + ': ' + (displayOf(update.u_focus) || 'Daily update'));

        if (displayOf(update.u_progress)) {
          lines.push('  Progress: ' + displayOf(update.u_progress));
        }

        if (displayOf(update.u_next_step)) {
          lines.push('  Next: ' + displayOf(update.u_next_step));
        }

        if (displayOf(update.u_blockers)) {
          lines.push('  Blockers: ' + displayOf(update.u_blockers));
        }
      });
    }

    lines.push('', '## Important Notes');

    if (!importantNotes.length) {
      lines.push('- No important notes this week.');
    } else {
      importantNotes.forEach(function(thought) {
        lines.push('- ' + valueOf(thought.u_note_date) + ' [' + noteTypeLabels[noteTypeFromTags(displayOf(thought.u_tags))] + '] ' + (displayOf(thought.u_title) || 'Note') + ': ' + displayOf(thought.u_note));
      });
    }

    downloadText('daily-work-log-' + weekStart + '-to-' + now + '.md', lines.join('\n'));
    notify('Weekly summary exported.');
  }

  function bindEvents() {
    on('du-refresh', 'click', loadAll);
    on('du-export-week', 'click', exportWeeklySummary);
    on('du-global-search', 'input', renderGlobalSearchResults);
    on('du-global-search', 'keydown', function(event) {
      if (event.key === 'Escape') {
        clearGlobalSearch();
      }
    });
    on('du-global-results', 'click', handleGlobalResultClick);
    document.addEventListener('click', function(event) {
      var results = byId('du-global-results');
      var topicFilterMenu = byId('du-topic-filter-menu');

      if (results && !event.target.closest('.du-global-search')) {
        results.hidden = true;
      }

      if (topicFilterMenu && !topicFilterMenu.hidden && !event.target.closest('.du-topic-list-panel')) {
        setTopicFilterMenu(false);
      }
    });
    on('du-open-settings', 'click', function() {
      showSettings(true);
    });
    on('du-home-new-topic', 'click', openNewTopic);
    on('du-close-settings', 'click', function() {
      showSettings(false);
    });
    on('du-clear-settings', 'click', function() {
      clearConnection();
      notify('Connection cleared.');
      showSettings(true);
    });
    on('du-test-connection', 'click', function() {
      testConnection(false).catch(function() {});
    });
    on('du-connect-existing-tab', 'click', function() {
      showConnectionPanel('existing');
    });
    on('du-register-tab', 'click', function() {
      showConnectionPanel('register');
    });
    on('du-settings-form', 'submit', function(event) {
      event.preventDefault();
      testConnection(true).catch(function() {});
    });
    on('du-register-form', 'submit', selfRegister);
    on('du-registration-key', 'click', handleRegistrationKeyClick);

    on('du-topic-form', 'submit', saveTopic);
    on('du-topic-reset', 'click', function() {
      resetTopicForm();
      renderTopicsPage();
      if (byId('du-topic-name')) {
        byId('du-topic-name').focus();
      }
    });
    on('du-topic-filter-toggle', 'click', function(event) {
      var menu = byId('du-topic-filter-menu');

      event.preventDefault();
      event.stopPropagation();
      setTopicFilterMenu(menu ? menu.hidden : true);
    });
    on('du-topic-filter-close', 'click', function() {
      setTopicFilterMenu(false);
    });
    on('du-topic-filter-clear', 'click', function() {
      applyTopicQuickFilter('active');
      setTopicFilterMenu(false);
    });
    on('du-topic-quick-filters', 'click', handleTopicQuickFilterClick);
    on('du-update-form', 'submit', saveUpdate);
    on('du-quick-form', 'submit', saveQuickUpdate);
    on('du-quick-topic', 'change', function() {
      var topic = topicById(byId('du-quick-topic').value);

      if (topic && byId('du-quick-type')) {
        byId('du-quick-type').value = topicType(topic);
      }
    });
    on('du-thought-form', 'submit', saveThought);
    on('du-thought-reset', 'click', resetThoughtForm);
    on('du-profile-form', 'submit', saveProfile);
    on('du-profile-reset', 'click', resetProfileForm);
    on('du-update-date', 'change', function() {
      renderWorkspace();
    });
    on('du-confidence', 'input', function() {
      if (byId('du-confidence-output') && byId('du-confidence')) {
        byId('du-confidence-output').textContent = byId('du-confidence').value + '%';
      }
    });

    ['du-topic-notes', 'du-progress', 'du-blockers', 'du-next-step', 'du-thought-note'].forEach(function(id) {
      on(id, 'input', renderLinkedTextPreviews);
    });

    PAGES.forEach(function(page) {
      on('du-nav-' + page, 'click', function(event) {
        event.preventDefault();
        showPage(page);
      });
    });

    on('du-home-topic-list', 'click', handleTopicAction);
    on('du-workspace-topic-list', 'click', handleTopicAction);
    on('du-topics-list', 'click', handleTopicAction);
    on('du-topic-detail-summary', 'click', handleTopicAction);
    on('du-topic-form-todos', 'click', handleTopicAction);
    on('du-workspace-topic-todos', 'click', handleTopicAction);
    on('du-topic-detail-actions', 'click', handleTopicAction);
    on('du-dashboard', 'click', handleDashboardClick);
    on('du-command-filters', 'click', handleCommandFilterClick);
    on('du-daily-brief', 'click', handleTopicAction);
    on('du-copy-daily-brief', 'click', copyDailyBrief);
    on('du-open-brief-focus', 'click', function() {
      openTopicsWithFilters({
        state: 'active',
        context: state.commandFilter.context,
        type: state.commandFilter.type
      });
    });
    on('du-parse-meeting-invite', 'click', parseMeetingInviteIntoTopic);
    on('du-preview-meeting-minutes', 'click', previewMeetingMinutes);
    on('du-save-meeting-minutes', 'click', saveMeetingMinutes);
    on('du-meeting-topic', 'change', function() {
      var topic = selectedMeetingTopic();
      saveSelectedTopic(topic ? topic.sys_id : '');
      renderMeetingAutomation(topic);
    });
    on('du-home-view-topics', 'click', function(event) {
      event.preventDefault();
      openTopicsWithFilters({
        state: 'active',
        context: state.commandFilter.context,
        type: state.commandFilter.type
      });
    });
    on('du-smart-sections', 'click', function(event) {
      handleTopicAction(event);
      handleUpdateListClick(event);
    });

    on('du-home-topic-list', 'change', handleTodoChange);
    on('du-topics-list', 'change', handleTodoChange);
    on('du-topic-form-todos', 'change', handleTodoChange);
    on('du-workspace-topic-todos', 'change', handleTodoChange);

    on('du-home-topic-list', 'keydown', handleTodoKeydown);
    on('du-topics-list', 'keydown', handleTodoKeydown);
    on('du-topic-form-todos', 'keydown', handleTodoKeydown);
    on('du-workspace-topic-todos', 'keydown', handleTodoKeydown);

    on('du-home-topic-list', 'dragstart', function(event) {
      var row = topicRowFromEvent(event);

      if (!row) {
        return;
      }

      state.dragTopicId = row.getAttribute('data-topic');
      row.classList.add('is-dragging');

      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', state.dragTopicId);
      }
    });

    on('du-home-topic-list', 'dragover', function(event) {
      var row = topicRowFromEvent(event);
      var rows;
      var i;

      if (!state.dragTopicId || !row || row.getAttribute('data-topic') === state.dragTopicId) {
        return;
      }

      event.preventDefault();
      rows = byId('du-home-topic-list').querySelectorAll('.du-topic-row');
      for (i = 0; i < rows.length; i += 1) {
        rows[i].classList.remove('is-drop-target');
      }
      row.classList.add('is-drop-target');
    });

    on('du-home-topic-list', 'drop', function(event) {
      var row = topicRowFromEvent(event);
      var targetTopicId;
      var targetRect;
      var placeAfter = false;

      if (!state.dragTopicId || !row) {
        return;
      }

      event.preventDefault();
      targetTopicId = row.getAttribute('data-topic');
      targetRect = row.getBoundingClientRect();
      placeAfter = event.clientY > targetRect.top + (targetRect.height / 2);
      clearDragClasses();

      if (targetTopicId && targetTopicId !== state.dragTopicId) {
        saveTopicOrder(moveTopicAround(state.dragTopicId, targetTopicId, placeAfter));
      }

      state.dragTopicId = '';
    });

    on('du-home-topic-list', 'dragend', function() {
      state.dragTopicId = '';
      clearDragClasses();
    });

    on('du-home-history-list', 'click', handleUpdateListClick);
    on('du-workspace-history-list', 'click', handleUpdateListClick);
    on('du-topic-update-history', 'click', handleUpdateListClick);
    on('du-all-updates-list', 'click', handleUpdateListClick);
    on('du-thought-list', 'click', handleThoughtListClick);
    on('du-profile-list', 'click', handleProfileListClick);
    on('du-generated-key', 'click', handleGeneratedKeyClick);
    on('du-page-ai', 'click', handleAiAction);
    on('du-ai-copy', 'click', copyAiOutput);
    on('du-ai-use-draft', 'click', useAiDraftAsUpdate);

    ['du-topic-filter-context', 'du-topic-filter-type', 'du-topic-filter-area', 'du-topic-filter-state', 'du-topic-filter-priority', 'du-topic-filter-from', 'du-topic-filter-to'].forEach(function(id) {
      on(id, 'change', renderTopicsPage);
    });

    on('du-topic-filter-search', 'input', renderTopicsPage);

    ['du-filter-topic', 'du-filter-context', 'du-filter-type', 'du-filter-area', 'du-filter-priority', 'du-filter-status', 'du-filter-from', 'du-filter-to'].forEach(function(id) {
      on(id, 'change', renderUpdatesPage);
    });

    on('du-filter-search', 'input', renderUpdatesPage);
  }

  if (byId('du-update-date')) {
    byId('du-update-date').value = sessionValue(PENDING_UPDATE_DATE_KEY) || today();
  }

  if (byId('du-quick-date')) {
    byId('du-quick-date').value = today();
  }

  if (byId('du-thought-date')) {
    byId('du-thought-date').value = today();
  }
  renderConnectionState();
  bindEvents();
  renderPage();
  renderLinkedTextPreviews();

  if (state.connection.apiKey) {
    loadAll();
  } else {
    showSettings(true);
  }
}());

