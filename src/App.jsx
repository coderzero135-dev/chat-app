import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

export default function App() {
  const [username, setUsername] = useState('');
  const [joined, setJoined] = useState(false);
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [ready, setReady] = useState(false);

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

    return () => {
      socket.close();
    };
  }, []);

  const connect = useCallback(() => {
    const name = username.trim();
    if (!name) return setError('Enter a username');
    if (!socketRef.current?.connected) return setError('Server not reachable');

    setConnecting(true);
    setError('');
    socketRef.current.emit('join', name);
    setJoined(true);
    setConnecting(false);
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
      joined ? send() : connect();
    }
  };

  if (!ready) {
    return (
      <div className="join-screen">
        <div className="join-box center">
          <div className="spinner" />
          <p className="scan-text">Connecting...</p>
        </div>
      </div>
    );
  }

  if (!joined) {
    return (
      <div className="join-screen">
        <div className="join-box">
          <h1 className="logo">Chat</h1>
          <input
            className="field"
            placeholder="Your username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            maxLength={20}
          />
          {error && <div className="error">{error}</div>}
          <button className="btn" onClick={connect} disabled={connecting}>
            {connecting ? 'Connecting...' : 'Join Chat'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>Chat</h2>
          <span className="online-count">{users.length} online</span>
        </div>
        <ul className="user-list">
          {users.map((u) => (
            <li key={u} className="user-item">
              <span className="user-dot" />
              {u}
            </li>
          ))}
        </ul>
      </aside>

      <main className="main">
        <div className="message-area">
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.type}`}>
              {m.type === 'system' ? (
                <span className="msg-system">{m.text}</span>
              ) : (
                <>
                  <span className="msg-user" style={{ color: m.color }}>
                    {m.username}
                  </span>
                  <span className="msg-text">{m.text}</span>
                </>
              )}
            </div>
          ))}
          <div ref={messagesEnd} />
        </div>

        <div className="input-bar">
          <input
            className="field msg-input"
            placeholder="Type a message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
          <button className="btn send-btn" onClick={send}>
            Send
          </button>
        </div>
      </main>
    </div>
  );
}
