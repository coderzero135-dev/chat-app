import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

function getInitials(name) {
  return name.slice(0, 2).toUpperCase();
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function App() {
  const [username, setUsername] = useState('');
  const [joined, setJoined] = useState(false);
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [myId, setMyId] = useState(null);
  const [myColor, setMyColor] = useState('#6366f1');

  const socketRef = useRef(null);
  const messagesEnd = useRef(null);

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
    setReady(true);

    socket.on('message', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    socket.on('users', (list) => {
      setUsers(list);
    });

    socket.on('welcome', ({ yourId, color }) => {
      setMyId(yourId);
      setMyColor(color);
    });

    return () => {
      socket.close();
    };
  }, []);

  const doJoin = useCallback(() => {
    const name = username.trim();
    if (!name) return setError('Enter a username');
    if (!socketRef.current?.connected) return setError('Server not reachable');

    setError('');
    socketRef.current.emit('join', name);
    setJoined(true);
  }, [username]);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || !socketRef.current) return;
    socketRef.current.emit('chat-message', text);
    setInput('');
  }, [input]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      joined ? send() : doJoin();
    }
  };

  if (!ready) {
    return (
      <div className="join-screen">
        <div className="join-card center">
          <div className="loader" />
          <p className="dim">Establishing connection...</p>
        </div>
      </div>
    );
  }

  if (!joined) {
    return (
      <div className="join-screen">
        <div className="join-card">
          <div className="join-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <h1 className="join-title">Welcome</h1>
          <p className="join-sub">Enter a username to start chatting</p>
          <input
            className="input"
            placeholder="Your username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            maxLength={20}
          />
          {error && <div className="err">{error}</div>}
          <button className="btn-primary" onClick={doJoin}>
            Join Chat
          </button>
        </div>
      </div>
    );
  }

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
            <div className="sidebar-title">Chatroom</div>
            <div className="sidebar-count">
              <span className="pulse-dot" /> {users.length} online
            </div>
          </div>
        </div>
        <ul className="user-list">
          {users.map((u) => {
            const isMe = u === username;
            return (
              <li key={u} className="user-row">
                <div className="avatar-sm" style={{ background: myColor }}>
                  {getInitials(u)}
                </div>
                <span className="user-name">{u}</span>
                {isMe && <span className="you-tag">you</span>}
              </li>
            );
          })}
        </ul>
        <div className="sidebar-foot">
          <span className="my-name">{username}</span>
        </div>
      </aside>

      <main className="main">
        <div className="msg-area">
          {messages.map((m, i) => {
            if (m.type === 'system') {
              return (
                <div key={i} className="msg-system">
                  {m.text}
                </div>
              );
            }

            const isMine = m.senderId === myId;
            const showAvatar = i === 0 || messages[i - 1]?.senderId !== m.senderId || messages[i - 1]?.type === 'system';

            return (
              <div key={i} className={`msg-row ${isMine ? 'mine' : 'theirs'}`}>
                {!isMine && showAvatar && (
                  <div className="avatar" style={{ background: m.color }}>
                    {getInitials(m.username)}
                  </div>
                )}
                {!isMine && !showAvatar && <div className="avatar-spacer" />}
                <div className="msg-bubble-wrap">
                  {showAvatar && (
                    <span className="msg-sender" style={{ color: m.color }}>
                      {m.username}
                    </span>
                  )}
                  <div className={`msg-bubble ${isMine ? 'bubble-mine' : 'bubble-theirs'} ${showAvatar ? (isMine ? 'first-mine' : 'first-theirs') : ''}`}>
                    {m.text}
                  </div>
                  <span className="msg-time">{formatTime(m.time)}</span>
                </div>
                {isMine && showAvatar && (
                  <div className="avatar" style={{ background: myColor }}>
                    {getInitials(username)}
                  </div>
                )}
                {isMine && !showAvatar && <div className="avatar-spacer" />}
              </div>
            );
          })}
          <div ref={messagesEnd} />
        </div>

        <div className="input-bar">
          <input
            className="chat-input"
            placeholder="Type a message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
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
