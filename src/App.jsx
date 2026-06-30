import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

const REACT_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

const EMOJI_LIST = [
  '😀','😃','😄','😁','😅','😂','🤣','😊',
  '😇','🙂','😉','😌','😍','🥰','😘','😗',
  '😋','😛','😜','🤪','😝','🤑','🤗','🤭',
  '🤔','🤐','😐','😑','😶','😏','😒','🙄',
  '😬','😮','🤐','😯','😲','😳','🥺','😢',
  '😭','😤','😡','🤬','💀','☠️','🤖','👻',
  '👍','👎','👏','🙌','🤝','💪','✌️','🤞',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍',
  '🔥','⭐','✨','💯','✅','❌','💩','🎉'
];

const ADJECTIVES = [
  'Secret', 'Hidden', 'Mystery', 'Shadow', 'Ghost', 'Silent', 'Phantom',
  'Stealth', 'Covert', 'Invisible', 'Unknown', 'Masked', 'Veiled', 'Cipher'
];

const ANIMALS = [
  'Fox', 'Wolf', 'Cat', 'Owl', 'Bear', 'Hawk', 'Lynx', 'Raven',
  'Cobra', 'Tiger', 'Shark', 'Falcon', 'Viper', 'Badger'
];

function randomName() {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const b = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${a} ${b}`;
}

function getOrCreateName() {
  try {
    const saved = localStorage.getItem('anonchat_name');
    if (saved) return saved;
  } catch (_) {}
  const name = randomName();
  try { localStorage.setItem('anonchat_name', name); } catch (_) {}
  return name;
}

function getInitials(name) {
  return name.slice(0, 2).toUpperCase();
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function parseMarkdown(text) {
  if (!text) return null;
  const parts = [];
  const re = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)|(@\S+)|((https?:\/\/\S+))/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: 'text', text: text.slice(last, m.index) });
    if (m[1]) parts.push({ type: 'bold', text: m[2] });
    else if (m[3]) parts.push({ type: 'italic', text: m[4] });
    else if (m[5]) parts.push({ type: 'code', text: m[6] });
    else if (m[7]) parts.push({ type: 'mention', text: m[7] });
    else if (m[8]) parts.push({ type: 'link', text: m[8] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', text: text.slice(last) });
  return parts;
}

let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playSound(type) {
  try {
    const ctx = getAudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    const now = ctx.currentTime;
    if (type === 'send') {
      o.type = 'sine';
      o.frequency.setValueAtTime(800, now);
      o.frequency.setValueAtTime(600, now + 0.06);
      g.gain.setValueAtTime(0.12, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      o.start(now);
      o.stop(now + 0.12);
    } else {
      o.type = 'sine';
      o.frequency.setValueAtTime(880, now);
      o.frequency.setValueAtTime(1100, now + 0.05);
      g.gain.setValueAtTime(0.15, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      o.start(now);
      o.stop(now + 0.15);
    }
  } catch (_) {}
}

async function searchGiphy(query) {
  try {
    const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=1v4qTWNi2CXOk0bMGRlJppNQoSIJWgI9&q=${encodeURIComponent(query)}&limit=20&rating=g`);
    const data = await res.json();
    return data.data.map((g) => g.images.fixed_height_small.url);
  } catch (_) { return []; }
}

function VoiceBubble({ url, isMine, msgId, playingId, setPlayingId }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (playingId !== msgId && playing) {
      audioRef.current?.pause();
      setPlaying(false);
    }
  }, [playingId, msgId, playing]);

  useEffect(() => {
    return () => clearInterval(intervalRef.current);
  }, []);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      a.play();
      setPlaying(true);
      setPlayingId(msgId);
      intervalRef.current = setInterval(() => setCurrentTime(a.currentTime), 100);
    } else {
      a.pause();
      setPlaying(false);
      setPlayingId(null);
      clearInterval(intervalRef.current);
    }
  };

  const onLoaded = (e) => setDuration(e.target.duration);
  const onEnded = () => { setPlaying(false); setPlayingId(null); clearInterval(intervalRef.current); setCurrentTime(0); };

  const bars = 20;
  const progress = duration > 0 ? currentTime / duration : 0;
  const filledBars = Math.floor(progress * bars);
  const displayTime = playing ? currentTime : (duration || 0);

  return (
    <div className={`voice-msg ${isMine ? 'voice-mine' : 'voice-theirs'}`}>
      <button className="voice-play-btn" onClick={toggle}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          {playing
            ? <><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></>
            : <polygon points="8,5 19,12 8,19"/>}
        </svg>
      </button>
      <div className="voice-waveform">
        {Array.from({ length: bars }).map((_, i) => (
          <span key={i} className={`voice-bar ${i < filledBars ? 'filled' : ''}`}
            style={{ height: `${8 + ((i * 7 + 3) % 13)}px` }} />
        ))}
      </div>
      <span className="voice-time">{formatVoiceTime(displayTime)}</span>
      <audio ref={audioRef} src={url} preload="metadata" onLoadedMetadata={onLoaded} onEnded={onEnded} />
    </div>
  );
}

function formatVoiceTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function App() {
  const [messages, setMessages] = useState([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [roomUsers, setRoomUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [roomList, setRoomList] = useState(['general']);
  const [currentRoom, setCurrentRoom] = useState('general');
  const [input, setInput] = useState('');
  const [ready, setReady] = useState(false);
  const [myId, setMyId] = useState(null);
  const [myName, setMyName] = useState('');
  const [myColor, setMyColor] = useState('#6366f1');
  const [reactionPicker, setReactionPicker] = useState(null);
  const [newRoomName, setNewRoomName] = useState('');
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [sendCooldown, setSendCooldown] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('anonchat_theme') || 'dark'; } catch (_) { return 'dark'; }
  });
  const [mentionQuery, setMentionQuery] = useState(null);
  const [mentionIdx, setMentionIdx] = useState(0);
  const [filePreview, setFilePreview] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [roomTopic, setRoomTopic] = useState(null);
  const [editTopic, setEditTopic] = useState(false);
  const [topicInput, setTopicInput] = useState('');
  const [recording, setRecording] = useState(false);
  const [voicePreview, setVoicePreview] = useState(null);
  const [micGranted, setMicGranted] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingLocked, setRecordingLocked] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState(null);
  const [giphyOpen, setGiphyOpen] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [giphyQuery, setGiphyQuery] = useState('');
  const [giphyResults, setGiphyResults] = useState([]);
  const [replyTo, setReplyTo] = useState(null);

  const socketRef = useRef(null);
  const messagesEnd = useRef(null);
  const msgAreaRef = useRef(null);
  const typingTimer = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const tabFocused = useRef(true);
  const notifPermitted = useRef(false);
  const msgCache = useRef({});
  const currentRoomRef = useRef('general');
  const myNameRef = useRef('');
  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);
  const recordTimer = useRef(null);
  const recordStartY = useRef(0);
  const recordingTimeRef = useRef(0);
  const recordingActive = useRef(false);
  const loadingOlder = useRef(false);
  const firstMsgRef = useRef(null);

  useEffect(() => { currentRoomRef.current = currentRoom; }, [currentRoom]);
  useEffect(() => { myNameRef.current = myName; }, [myName]);

  useEffect(() => {
    if (messagesEnd.current) {
      messagesEnd.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    if (firstMsgRef.current && msgAreaRef.current) {
      const io = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting && hasOlder && !loadingOlder.current) {
          loadingOlder.current = true;
          const oldest = messages[0];
          if (oldest) socketRef.current?.emit('load-older', oldest.id);
        }
      }, { root: msgAreaRef.current, threshold: 0.1 });
      io.observe(firstMsgRef.current);
      return () => io.disconnect();
    }
  }, [messages, hasOlder]);

  useEffect(() => {
    document.body.className = `theme-${theme}`;
    try { localStorage.setItem('anonchat_theme', theme); } catch (_) {}
  }, [theme]);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'granted') {
      notifPermitted.current = true;
    }
    const onFocus = () => { tabFocused.current = true; setUnreadCount(0); };
    const onBlur = () => { tabFocused.current = false; };
    const onVis = () => {
      if (document.visibilityState === 'visible') { tabFocused.current = true; setUnreadCount(0); }
      else { tabFocused.current = false; }
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  useEffect(() => {
    document.title = unreadCount > 0 ? `(${unreadCount}) AnonChat` : 'AnonChat';
  }, [unreadCount]);

  useEffect(() => {
    const isCapacitor = typeof window !== 'undefined' && (window.Capacitor || window.Capacitor?.isNative);
    const serverUrl = isCapacitor ? 'https://chat-app.onrender.com' : undefined;
    const socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      const name = getOrCreateName();
      setMyName(name);
      setReady(true);
      socket.emit('join', name);
    });

    socket.on('welcome', ({ yourId, color }) => {
      setMyId(yourId);
      setMyColor(color);
    });

    socket.on('room-list', (list) => setRoomList(list));

    socket.on('load-messages', (msgs) => {
      setMessages(msgs);
      setHasOlder(msgs.length >= 50);
      msgCache.current[currentRoomRef.current] = msgs;
    });

    socket.on('older-messages', (older) => {
      loadingOlder.current = false;
      if (older.length < 50) setHasOlder(false);
      setMessages((prev) => [...older, ...prev]);
    });

    socket.on('message', (msg) => {
      setMessages((prev) => {
        const next = [...prev, msg];
        msgCache.current[currentRoomRef.current] = next;
        return next;
      });
      if (msg.type === 'user' && msg.senderId !== myId) {
        playSound('receive');
        const mentionedMe = msg.text && myNameRef.current && (msg.text.includes(`@${myNameRef.current}`) || (typeof msg.text === 'string' && msg.text.match(new RegExp(`@${myNameRef.current}\\b`))));
        if (!tabFocused.current || document.visibilityState !== 'visible' || mentionedMe) {
          setUnreadCount((c) => c + 1);
          if (notifPermitted.current) {
            new Notification(`${msg.username} — #${currentRoomRef.current}`, {
              body: (msg.text || '').slice(0, 120),
              icon: '/favicon.ico',
              tag: 'chat-msg'
            });
          }
        }
      }
    });

    socket.on('message-deleted', ({ messageId }) => {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    });

    socket.on('room-topic', ({ room, topic }) => {
      if (room === currentRoomRef.current) setRoomTopic(topic);
    });

    socket.on('room-users', ({ room, users: list }) => {
      if (room === currentRoomRef.current) setRoomUsers(list);
    });

    socket.on('typing-update', ({ room, users: list }) => {
      if (room === currentRoomRef.current) {
        setTypingUsers(list.filter((u) => u !== myNameRef.current));
      }
    });

    socket.on('reaction-update', ({ messageId, reactions }) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reactions } : m))
      );
    });

    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      socket.close();
    };
  }, []);

  const switchRoom = useCallback((room) => {
    if (room === currentRoom) return;
    setCurrentRoom(room);
    setRoomTopic(null);
    setReplyTo(null);
    const cached = msgCache.current[room];
    if (cached) { setMessages(cached); setHasOlder(cached.length >= 50); }
    else setMessages([]);
    socketRef.current?.emit('join-room', room);
    setSidebarOpen(false);
  }, [currentRoom]);

  const createRoom = useCallback(() => {
    const name = newRoomName.trim();
    if (!name) return;
    socketRef.current?.emit('create-room', name);
    setNewRoomName('');
    setShowNewRoom(false);
  }, [newRoomName]);

  const uploadFile = useCallback(async (file) => {
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch('/upload', { method: 'POST', body: form });
      const data = await res.json();
      return data.url;
    } catch (_) { return null; }
  }, []);

  const startRecording = useCallback(async () => {
    if (micGranted === false) return;
    recordingActive.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!recordingActive.current) { stream.getTracks().forEach(t => t.stop()); return; }
      setMicGranted(true);
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm' });
      mediaRecorder.current = mr;
      audioChunks.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(recordTimer.current);
        const dur = recordingTimeRef.current;
        setRecordingTime(0);
        recordingTimeRef.current = 0;
        recordingActive.current = false;
        if (dur < 0.5 || audioChunks.current.length === 0) { setRecording(false); return; }
        const blob = new Blob(audioChunks.current, { type: 'audio/webm' });
        const blobUrl = URL.createObjectURL(blob);
        setVoicePreview({ blob, blobUrl, name: `voice-${Date.now()}.webm`, duration: dur });
      };
      mr.onerror = () => { setRecording(false); clearInterval(recordTimer.current); recordingActive.current = false; };
      mr.start(100);
      setRecording(true);
      setRecordingLocked(false);
      recordingTimeRef.current = 0;
      setRecordingTime(0);
      recordTimer.current = setInterval(() => {
        recordingTimeRef.current += 0.1;
        setRecordingTime(recordingTimeRef.current);
      }, 100);
    } catch (_) {
      setMicGranted(false);
      setRecording(false);
      recordingActive.current = false;
    }
  }, [micGranted]);

  const stopRecording = useCallback(() => {
    recordingActive.current = false;
    if (recordingLocked) return;
    if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
      mediaRecorder.current.stop();
    }
  }, [recordingLocked]);

  const lockRecording = useCallback(() => {
    setRecordingLocked(true);
  }, []);

  const cancelRecording = useCallback(() => {
    recordingActive.current = false;
    if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
      mediaRecorder.current.ondataavailable = null;
      mediaRecorder.current.stop();
    }
    clearInterval(recordTimer.current);
    setRecording(false);
    setRecordingLocked(false);
    setRecordingTime(0);
  }, []);

  const cancelVoice = useCallback(() => {
    if (voicePreview) URL.revokeObjectURL(voicePreview.blobUrl);
    setVoicePreview(null);
  }, [voicePreview]);

  const sendVoice = useCallback(async () => {
    if (!voicePreview || !socketRef.current) return;
    const url = await uploadFile(new File([voicePreview.blob], voicePreview.name, { type: 'audio/webm' }));
    if (url) {
      socketRef.current.emit('chat-message', JSON.stringify({ type: 'voice', url, name: 'Voice message' }));
      playSound('send');
    }
    URL.revokeObjectURL(voicePreview.blobUrl);
    setVoicePreview(null);
  }, [voicePreview, uploadFile]);

  const send = useCallback(async () => {
    const text = input.trim();
    const f = filePreview;
    const hasContent = text || f;
    if (!hasContent || !socketRef.current || sendCooldown) return;

    if (f) {
      const url = await uploadFile(f.file);
      if (url) {
        socketRef.current.emit('chat-message', JSON.stringify({ type: f.type, url, name: f.name }));
      }
    }
    if (text) {
      socketRef.current.emit('chat-message', text);
    }
    setInput('');
    setFilePreview(null);
    setShowEmojiPicker(false);
    setSendCooldown(true);
    setMentionQuery(null);
    setReplyTo(null);
    playSound('send');
    setTimeout(() => setSendCooldown(false), 350);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    socketRef.current.emit('typing', false);
  }, [input, sendCooldown, filePreview, uploadFile]);

  const handleTyping = useCallback((val) => {
    setInput(val);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    socketRef.current?.emit('typing', true);
    typingTimer.current = setTimeout(() => {
      socketRef.current?.emit('typing', false);
    }, 2000);

    const atMatch = val.match(/@(\S*)$/);
    if (atMatch && roomUsers.length > 0) {
      const q = atMatch[1].toLowerCase();
      const hits = roomUsers.filter((u) => u !== myNameRef.current && u.toLowerCase().includes(q));
      if (hits.length > 0) { setMentionQuery({ q, hits }); setMentionIdx(0); return; }
    }
    setMentionQuery(null);
  }, [roomUsers]);

  const insertMention = useCallback((username) => {
    const el = inputRef.current;
    if (!el) return;
    const val = input;
    const atPos = val.lastIndexOf('@', el.selectionStart);
    if (atPos < 0) return;
    const before = val.slice(0, atPos);
    const after = val.slice(el.selectionStart);
    const next = before + '@' + username + ' ' + after;
    setInput(next);
    setMentionQuery(null);
    setTimeout(() => {
      const pos = before.length + username.length + 2;
      el.selectionStart = el.selectionEnd = pos;
      el.focus();
    }, 0);
    handleTyping(next);
  }, [input, handleTyping]);

  const handleReact = useCallback((messageId, emoji) => {
    socketRef.current?.emit('react', { messageId, emoji });
    setReactionPicker(null);
  }, []);

  const handleContextMenu = useCallback((e, msg) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, message: msg, isMine: msg.senderId === myId });
  }, [myId]);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const copyMessage = useCallback((text) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setContextMenu(null);
  }, []);

  const deleteMessage = useCallback((messageId) => {
    socketRef.current?.emit('delete-message', messageId);
    setContextMenu(null);
  }, []);

  const replyToMessage = useCallback((msg) => {
    setReplyTo(msg);
    setContextMenu(null);
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e) => {
    if (mentionQuery) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx((i) => Math.min(i + 1, mentionQuery.hits.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIdx((i) => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionQuery.hits[mentionIdx]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setMentionQuery(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  useEffect(() => {
    const handler = () => setContextMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, []);

  const changeIdentity = useCallback(() => {
    try { localStorage.removeItem('anonchat_name'); } catch (_) {}
    window.location.reload();
  }, []);

  const enableNotifications = useCallback(() => {
    if (!('Notification' in window)) return;
    Notification.requestPermission().then((p) => {
      notifPermitted.current = p === 'granted';
    });
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  const handleFilePick = useCallback(() => fileRef.current?.click(), []);

  const handleFileChange = useCallback((e) => {
    const f = e.target.files[0];
    if (!f) return;
    const isImg = f.type.startsWith('image/');
    const reader = new FileReader();
    reader.onload = (ev) => {
      setFilePreview({ file: f, name: f.name, type: isImg ? 'image' : 'file', dataUrl: ev.target.result });
    };
    reader.readAsDataURL(f);
    e.target.value = '';
  }, []);

  const saveTopic = useCallback(() => {
    const t = topicInput.trim();
    socketRef.current?.emit('set-topic', t);
    setRoomTopic(t || null);
    setEditTopic(false);
    setTopicInput('');
  }, [topicInput]);

  const handleGiphySearch = useCallback(async (q) => {
    setGiphyQuery(q);
    if (q.length < 2) { setGiphyResults([]); return; }
    const results = await searchGiphy(q);
    setGiphyResults(results);
  }, []);

  const sendGif = useCallback((url) => {
    if (socketRef.current) {
      socketRef.current.emit('chat-message', JSON.stringify({ type: 'image', url, name: 'GIF' }));
      playSound('send');
    }
    setGiphyOpen(false);
    setGiphyQuery('');
    setGiphyResults([]);
  }, []);

  const insertEmoji = useCallback((emoji) => {
    const el = inputRef.current;
    if (!el) { setInput((prev) => prev + emoji); return; }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const before = input.slice(0, start);
    const after = input.slice(end);
    const next = before + emoji + after;
    setInput(next);
    setTimeout(() => {
      el.selectionStart = el.selectionEnd = start + emoji.length;
      el.focus();
    }, 0);
    handleTyping(next);
  }, [input, handleTyping]);

  const handleNewRoomKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); createRoom(); }
  };

  const renderContent = useCallback((text) => {
    if (!text) return null;
    const parts = parseMarkdown(text);
    return parts.map((p, i) => {
      if (p.type === 'bold') return <strong key={i}>{p.text}</strong>;
      if (p.type === 'italic') return <em key={i}>{p.text}</em>;
      if (p.type === 'code') return <code key={i} className="inline-code">{p.text}</code>;
      if (p.type === 'link') return <a key={i} href={p.text} target="_blank" rel="noopener noreferrer" className="chat-link">{p.text}</a>;
      if (p.type === 'mention') {
        const name = p.text.slice(1);
        return <span key={i} className={`mention ${name === myName ? 'mention-me' : ''}`}>@{name}</span>;
      }
      return <span key={i}>{p.text}</span>;
    });
  }, [myName]);

  if (!ready) {
    return (
      <div className="join-screen">
        <div className="join-card center">
          <div className="loader" />
          <p className="dim">Joining anonymously...</p>
        </div>
      </div>
    );
  }

  const typingText = typingUsers.length === 1
    ? `${typingUsers[0]} is typing...`
    : typingUsers.length > 1
    ? `${typingUsers.length} people typing...`
    : null;

  return (
    <div className={`chat-layout ${sidebarOpen ? 'sidebar-open' : ''}`} onClick={closeContextMenu}>
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <aside className="sidebar">
        <div className="sidebar-head">
          <div className="sidebar-logo">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div>
            <div className="sidebar-title">AnonChat</div>
            <div className="sidebar-count">
              <span className="pulse-dot" /> {roomUsers.length} online
            </div>
          </div>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="room-section">
          <div className="section-label">ROOMS</div>
          <ul className="room-list">
            {roomList.map((r) => (
              <li key={r} className={`room-item ${r === currentRoom ? 'active' : ''}`}
                onClick={() => switchRoom(r)}>
                <span className="room-hash">#</span> {r}
              </li>
            ))}
          </ul>
          {showNewRoom ? (
            <div className="new-room-form">
              <input className="input-sm" placeholder="Room name" value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)} onKeyDown={handleNewRoomKey}
                autoFocus maxLength={30} />
              <button className="btn-xs" onClick={createRoom}>+</button>
              <button className="btn-xs cancel" onClick={() => setShowNewRoom(false)}>&times;</button>
            </div>
          ) : (
            <button className="new-room-btn" onClick={() => setShowNewRoom(true)}>
              + Create Room
            </button>
          )}
        </div>

        <div className="user-section">
          <div className="section-label">ONLINE — {currentRoom}</div>
          <ul className="user-list">
            {roomUsers.map((u) => (
              <li key={u} className="user-row" onClick={() => { setInput((prev) => prev + '@' + u + ' '); inputRef.current?.focus(); }}>
                <div className="avatar-sm" style={{ background: myColor }}>
                  {getInitials(u)}
                </div>
                <span className="user-name">{u}</span>
                {u === myName && <span className="you-tag">you</span>}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="main">
        <div className="main-header">
          <button className="hamburger" onClick={() => setSidebarOpen(true)} aria-label="Menu">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="room-label"># {currentRoom}</span>
          <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
            {theme === 'dark' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
          </button>
          {myName && (
            <span className="my-tag">
              You are {myName}
              <button className="new-name-btn" onClick={changeIdentity} title="New identity">&#x21bb;</button>
            </span>
          )}
          {!notifPermitted.current && 'Notification' in window && Notification.permission !== 'denied' && (
            <button className="notif-btn" onClick={enableNotifications} title="Enable notifications">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
            </button>
          )}
        </div>

        {roomTopic && (
          <div className="topic-bar" onClick={() => { setEditTopic(true); setTopicInput(roomTopic); }}>
            <span className="topic-text">{roomTopic}</span>
            <span className="topic-edit-hint">click to edit</span>
          </div>
        )}
        {editTopic && (
          <div className="topic-edit-bar">
            <input className="topic-input" placeholder="Set room topic..." value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveTopic(); if (e.key === 'Escape') setEditTopic(false); }}
              autoFocus maxLength={100} />
            <button className="btn-xs" onClick={saveTopic}>Save</button>
            <button className="btn-xs cancel" onClick={() => setEditTopic(false)}>&times;</button>
          </div>
        )}
        {!roomTopic && !editTopic && (
          <div className="topic-bar empty" onClick={() => setEditTopic(true)}>
            <span className="topic-text dim">Add a topic</span>
          </div>
        )}

        <div className="msg-area" ref={msgAreaRef}>
          {messages.map((m, i) => {
            if (m.type === 'system') {
              return <div key={i} className="msg-system" ref={i === 0 ? firstMsgRef : null}>{m.text}</div>;
            }
            const isMine = m.senderId === myId;
            const showAvatar = i === 0 || messages[i - 1]?.senderId !== m.senderId || messages[i - 1]?.type === 'system';
            const hasReactions = m.reactions && Object.keys(m.reactions).length > 0;

            return (
              <div key={m.id || i} className={`msg-row ${isMine ? 'mine' : 'theirs'}`}
                onContextMenu={(e) => handleContextMenu(e, m)}
                ref={i === 0 ? firstMsgRef : null}>
                {!isMine && showAvatar && (
                  <div className="avatar" style={{ background: m.color }}>{getInitials(m.username)}</div>
                )}
                {!isMine && !showAvatar && <div className="avatar-spacer" />}
                <div className="msg-bubble-wrap">
                  {showAvatar && (
                    <span className="msg-sender" style={{ color: m.color }}>{m.username}</span>
                  )}
                  <div className={`msg-bubble ${isMine ? 'bubble-mine' : 'bubble-theirs'} ${showAvatar ? (isMine ? 'first-mine' : 'first-theirs') : ''}`}
                    onMouseEnter={() => setReactionPicker(m.id)}
                    onMouseLeave={() => setReactionPicker(null)}>
                    {m.file && m.file.type === 'image' && (
                      <img src={m.file.url} alt={m.file.name} className="msg-image" loading="lazy" />
                    )}
                    {m.file && m.file.type === 'file' && (
                      <a href={m.file.url} target="_blank" rel="noopener noreferrer" className="msg-file">📎 {m.file.name}</a>
                    )}
                    {m.file && m.file.type === 'voice' && (
                      <VoiceBubble url={m.file.url} isMine={isMine} msgId={m.id}
                        playingId={playingVoiceId} setPlayingId={setPlayingVoiceId} />
                    )}
                    {renderContent(m.text)}
                    {reactionPicker === m.id && (
                      <div className="reaction-bar" onClick={(e) => e.stopPropagation()}>
                        {REACT_EMOJIS.map((e) => (
                          <button key={e} className="react-btn" onClick={() => handleReact(m.id, e)}>{e}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  {hasReactions && (
                    <div className="reactions">
                      {Object.entries(m.reactions).map(([emoji, ids]) => (
                        <span key={emoji} className="reaction-badge">{emoji} {ids.length}</span>
                      ))}
                    </div>
                  )}
                  <span className="msg-time">{formatTime(m.time)}</span>
                </div>
                {isMine && showAvatar && (
                  <div className="avatar" style={{ background: myColor }}>{getInitials(myName)}</div>
                )}
                {isMine && !showAvatar && <div className="avatar-spacer" />}
              </div>
            );
          })}
          {typingUsers.length > 0 && (
            <div className="typing-bubble-row">
              <div className="avatar-sm typing-avatar">{getInitials(typingUsers[0])}</div>
              <div className="typing-bubble">
                <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
              </div>
              <span className="typing-label">{typingText}</span>
            </div>
          )}
          <div ref={messagesEnd} />
        </div>

        {filePreview && (
          <div className="file-preview-bar">
            {filePreview.type === 'image' ? (
              <img src={filePreview.dataUrl} alt="" className="file-preview-img" />
            ) : (
              <span className="file-preview-name">📎 {filePreview.name}</span>
            )}
            <button className="file-preview-cancel" onClick={() => setFilePreview(null)}>&times;</button>
          </div>
        )}

        {voicePreview && (
          <div className="voice-preview-bar">
            <div className="voice-recording-indicator">
              <span className="voice-wave">
                <span className="voice-wave-bar" /><span className="voice-wave-bar" /><span className="voice-wave-bar" />
                <span className="voice-wave-bar" /><span className="voice-wave-bar" />
              </span>
              <audio controls src={voicePreview.blobUrl} className="voice-preview-audio" autoPlay />
            </div>
            <div className="voice-preview-actions">
              <button className="voice-send-btn" onClick={sendVoice} title="Send">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
              <button className="voice-cancel-btn" onClick={cancelVoice} title="Cancel">&times;</button>
            </div>
          </div>
        )}

        {replyTo && (
          <div className="reply-bar">
            <span className="reply-label">Replying to <strong>{replyTo.username}</strong></span>
            <span className="reply-preview">{replyTo.text?.slice(0, 60) || (replyTo.file ? '[file]' : '')}</span>
            <button className="reply-cancel" onClick={() => setReplyTo(null)}>&times;</button>
          </div>
        )}

        <div className="input-area" style={{ position: 'relative' }}>
          <div className="input-bar">
            <div className="plus-menu-wrap">
              <button className="emoji-toggle" onClick={() => setShowPlusMenu((v) => !v)} title="More">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
              {showPlusMenu && (
                <>
                  <div className="plus-backdrop" onClick={() => setShowPlusMenu(false)} />
                  <div className="plus-menu">
                    <button className="plus-item" onClick={() => { setShowEmojiPicker(true); setShowPlusMenu(false); }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                      <span>Emoji</span>
                    </button>
                    <button className="plus-item" onClick={() => { handleFilePick(); setShowPlusMenu(false); }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                      <span>File</span>
                    </button>
                    <button className="plus-item" onClick={() => { setGiphyOpen((v) => !v); setShowPlusMenu(false); }}>
                      <span className="plus-gif-label">GIF</span>
                    </button>
                  </div>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" className="file-input-hidden" onChange={handleFileChange} accept="image/*,.pdf,.doc,.docx,.txt,.zip" />
            <input ref={inputRef} className="chat-input" placeholder={`Message #${currentRoom}`}
              value={input}
              onChange={(e) => handleTyping(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus />
            {input.trim() || filePreview ? (
              <button className={`send-btn ${sendCooldown ? 'cooling' : ''}`} onClick={send} disabled={(!input.trim() && !filePreview) || sendCooldown}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            ) : (
              <button className={`send-btn mic-btn ${recording ? 'recording' : ''}`}
                onPointerDown={(e) => { e.preventDefault(); recordStartY.current = e.clientY; startRecording(); }}
                onPointerUp={(e) => { e.preventDefault(); stopRecording(); }}
                onPointerMove={(e) => { if (recording && e.clientY < recordStartY.current - 60) lockRecording(); }}
                title="Hold to record, slide up to lock"
                disabled={micGranted === false}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              </button>
            )}
          </div>
          {mentionQuery && (
            <div className="mention-dropdown">
              {mentionQuery.hits.map((u, idx) => (
                <button key={u} className={`mention-item ${idx === mentionIdx ? 'active' : ''}`}
                  onClick={() => insertMention(u)}
                  onMouseEnter={() => setMentionIdx(idx)}>
                  <span className="mention-avatar" style={{ background: myColor }}>{getInitials(u)}</span>
                  {u}
                </button>
              ))}
            </div>
          )}
          {giphyOpen && (
            <>
              <div className="emoji-backdrop" onClick={() => { setGiphyOpen(false); setGiphyQuery(''); setGiphyResults([]); }} />
              <div className="giphy-panel">
                <input className="giphy-search" placeholder="Search GIFs..." value={giphyQuery}
                  onChange={(e) => handleGiphySearch(e.target.value)} autoFocus />
                <div className="giphy-grid">
                  {giphyResults.map((url, i) => (
                    <img key={i} src={url} alt="" className="giphy-item" onClick={() => sendGif(url)} loading="lazy" />
                  ))}
                </div>
              </div>
            </>
          )}
          {showEmojiPicker && (
            <>
              <div className="emoji-backdrop" onClick={() => setShowEmojiPicker(false)} />
              <div className="emoji-panel">
                {EMOJI_LIST.map((e) => (
                  <button key={e} className="emoji-item" onClick={() => insertEmoji(e)}>{e}</button>
                ))}
              </div>
            </>
          )}
        </div>

        {recording && (
          <div className="record-overlay">
            <div className="record-container">
              {recordingLocked ? (
                <div className="record-locked">
                  <span className="record-lock-icon">🔒</span>
                  <span className="record-hint">Recording locked — tap to stop</span>
                </div>
              ) : (
                <div className="record-hold-hint">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                  <span>Slide up to lock recording</span>
                </div>
              )}
              <div className="record-wave">
                {Array.from({ length: 16 }).map((_, i) => (
                  <span key={i} className="record-bar" style={{ animationDelay: `${i * 0.07}s`, height: `${12 + Math.sin(i * 0.7) * 10}px` }} />
                ))}
              </div>
              <div className="record-info">
                <span className="record-timer">{recordingTime.toFixed(1)}s</span>
                <span className="record-dot" />
              </div>
              <button className="record-cancel-btn" onClick={cancelRecording}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
          </div>
        )}

      </main>

      {contextMenu && (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button className="context-item" onClick={() => copyMessage(contextMenu.message.file ? contextMenu.message.file.url : contextMenu.message.text)}>Copy</button>
          {contextMenu.isMine && (
            <button className="context-item danger" onClick={() => deleteMessage(contextMenu.message.id)}>Delete</button>
          )}
          <button className="context-item" onClick={() => replyToMessage(contextMenu.message)}>Reply</button>
        </div>
      )}
    </div>
  );
}
