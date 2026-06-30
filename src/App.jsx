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

export default function App() {
  const [messages, setMessages] = useState([]);
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

  const socketRef = useRef(null);
  const messagesEnd = useRef(null);
  const typingTimer = useRef(null);
  const inputRef = useRef(null);
  const tabFocused = useRef(true);
  const notifPermitted = useRef(false);
  const msgCache = useRef({});
  const currentRoomRef = useRef('general');
  const myNameRef = useRef('');

  useEffect(() => {
    currentRoomRef.current = currentRoom;
  }, [currentRoom]);

  useEffect(() => {
    myNameRef.current = myName;
  }, [myName]);

  useEffect(() => {
    if (messagesEnd.current) {
      messagesEnd.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'granted') {
      notifPermitted.current = true;
    }

    const onFocus = () => {
      tabFocused.current = true;
      setUnreadCount(0);
    };
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
      msgCache.current[currentRoomRef.current] = msgs;
    });

    socket.on('message', (msg) => {
      setMessages((prev) => {
        const next = [...prev, msg];
        msgCache.current[currentRoomRef.current] = next;
        return next;
      });
      if (msg.type === 'user' && msg.senderId !== myId) {
        if (!tabFocused.current || document.visibilityState !== 'visible') {
          setUnreadCount((c) => c + 1);
          if (notifPermitted.current) {
            new Notification(`${msg.username} — #${currentRoomRef.current}`, {
              body: msg.text.slice(0, 120),
              icon: '/favicon.ico',
              tag: 'chat-msg'
            });
          }
        }
      }
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
    setMessages(msgCache.current[room] || []);
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

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || !socketRef.current || sendCooldown) return;
    socketRef.current.emit('chat-message', text);
    setInput('');
    setShowEmojiPicker(false);
    setSendCooldown(true);
    setTimeout(() => setSendCooldown(false), 350);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    socketRef.current.emit('typing', false);
  }, [input, sendCooldown]);

  const handleTyping = useCallback((val) => {
    setInput(val);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    socketRef.current?.emit('typing', true);
    typingTimer.current = setTimeout(() => {
      socketRef.current?.emit('typing', false);
    }, 2000);
  }, []);

  const handleReact = useCallback((messageId, emoji) => {
    socketRef.current?.emit('react', { messageId, emoji });
    setReactionPicker(null);
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

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

  const firstTypingUser = typingUsers[0];
  const typingInitials = firstTypingUser ? getInitials(firstTypingUser) : '';

  return (
    <div className={`chat-layout ${sidebarOpen ? 'sidebar-open' : ''}`}>
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
              <li key={u} className="user-row">
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

        <div className="msg-area">
          {messages.map((m, i) => {
            if (m.type === 'system') {
              return <div key={i} className="msg-system">{m.text}</div>;
            }
            const isMine = m.senderId === myId;
            const showAvatar = i === 0 || messages[i - 1]?.senderId !== m.senderId || messages[i - 1]?.type === 'system';
            const hasReactions = m.reactions && Object.keys(m.reactions).length > 0;

            return (
              <div key={m.id || i} className={`msg-row ${isMine ? 'mine' : 'theirs'}`}>
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
                    {m.text}
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
              <div className="avatar-sm typing-avatar">{typingInitials}</div>
              <div className="typing-bubble">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
              <span className="typing-label">{typingText}</span>
            </div>
          )}
          <div ref={messagesEnd} />
        </div>

        <div className="input-area">
          <div className="input-bar">
            <button className="emoji-toggle" onClick={() => setShowEmojiPicker((v) => !v)} title="Emoji">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                <line x1="9" y1="9" x2="9.01" y2="9" />
                <line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
            </button>
            <input ref={inputRef} className="chat-input" placeholder={`Message #${currentRoom}`}
              value={input}
              onChange={(e) => handleTyping(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus />
            <button className={`send-btn ${sendCooldown ? 'cooling' : ''}`} onClick={send} disabled={!input.trim() || sendCooldown}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
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
      </main>
    </div>
  );
}
