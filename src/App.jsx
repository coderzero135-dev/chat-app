import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

const REACT_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

const ADJECTIVES = [
  'Secret', 'Hidden', 'Mystery', 'Shadow', 'Ghost', 'Silent', 'Phantom',
  'Stealth', 'Covert', 'Invisible', 'Unknown', 'Masked', 'Veiled', 'Cipher'
];

const ANIMALS = [
  'Fox', 'Wolf', 'Cat', 'Owl', 'Bear', 'Hawk', 'Lynx', 'Raven',
  'Cobra', 'Tiger', 'Shark', 'Falcon', 'Viper', 'Badger'
];

function getOrCreateName() {
  const saved = localStorage.getItem('anonchat_name');
  if (saved) return saved;
  const name = randomName();
  localStorage.setItem('anonchat_name', name);
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

  const socketRef = useRef(null);
  const messagesEnd = useRef(null);
  const typingTimer = useRef(null);
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
    const socket = io({
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

    return () => socket.close();
  }, []);

  const switchRoom = useCallback((room) => {
    if (room === currentRoom) return;
    setCurrentRoom(room);
    setMessages(msgCache.current[room] || []);
    socketRef.current?.emit('join-room', room);
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
    if (!text || !socketRef.current) return;
    socketRef.current.emit('chat-message', text);
    setInput('');
    if (typingTimer.current) clearTimeout(typingTimer.current);
    socketRef.current.emit('typing', false);
  }, [input]);

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
    localStorage.removeItem('anonchat_name');
    window.location.reload();
  }, []);

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
    <div className="chat-layout">
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
          <span className="room-label"># {currentRoom}</span>
          {myName && (
            <span className="my-tag">
              You are {myName}
              <button className="new-name-btn" onClick={changeIdentity} title="New identity">&#x21bb;</button>
            </span>
          )}
          {typingText && <span className="typing-indicator">{typingText}</span>}
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
          <div ref={messagesEnd} />
        </div>

        <div className="input-bar">
          <input className="chat-input" placeholder={`Message #${currentRoom}`}
            value={input}
            onChange={(e) => handleTyping(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus />
          <button className="send-btn" onClick={send} disabled={!input.trim()}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </main>
    </div>
  );
}
