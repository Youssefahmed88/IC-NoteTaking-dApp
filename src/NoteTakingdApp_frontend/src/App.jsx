import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Wallet, RefreshCw, LogIn, LogOut } from 'lucide-react';

// IC Agent imports - install these packages:
// npm install @dfinity/agent @dfinity/auth-client @dfinity/principal @dfinity/candid

// Uncomment these imports when you install the packages:
import { Actor, HttpAgent } from '@dfinity/agent';
import { AuthClient } from '@dfinity/auth-client';
import { Principal } from '@dfinity/principal';

const NotesApp = () => {
  const [notes, setNotes] = useState([]);
  const [balance, setBalance] = useState(0);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [loading, setLoading] = useState(false);
  const [newNote, setNewNote] = useState({ title: '', content: '' });
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [principal, setPrincipal] = useState(null);
  const [actor, setActor] = useState(null);
  const [authClient, setAuthClient] = useState(null);
  const [error, setError] = useState('');

  // Replace with your actual canister ID
  const CANISTER_ID = 'uxrrr-q7777-77774-qaaaq-cai';
  
  // Internet Identity URL
  const II_URL = process.env.NODE_ENV === 'production' 
    ? 'https://identity.ic0.app'
    : 'http://localhost:4943/?canisterId=rdmx6-jaaaa-aaaaa-aaadq-cai';

  // IDL Factory for your canister - matches your Rust backend
  const idlFactory = ({ IDL }) => {
    const Note = IDL.Record({ 
      'title': IDL.Text, 
      'content': IDL.Text 
    });
    
    const Result = IDL.Variant({ 'Ok': Note, 'Err': IDL.Text });
    const Result_1 = IDL.Variant({ 'Ok': IDL.Text, 'Err': IDL.Text });
    const Result_2 = IDL.Variant({ 'Ok': IDL.Null, 'Err': IDL.Text });
    
    return IDL.Service({
      'add_note': IDL.Func([IDL.Nat64, Note], [Result], []),
      'update_note': IDL.Func([IDL.Nat64, Note], [IDL.Opt(Note)], []),
      'get_note': IDL.Func([IDL.Nat64], [IDL.Opt(Note)], ['query']),
      'list_notes': IDL.Func([], [IDL.Vec(IDL.Tuple(IDL.Nat64, Note))], ['query']),
      'delete_note': IDL.Func([IDL.Nat64], [Result_1], []),
      'balance_of': IDL.Func([], [IDL.Nat64], ['query']),
      'mint': IDL.Func([IDL.Principal, IDL.Nat64], [Result_2], []),
    });
  };

  // Initialize authentication on component mount
  useEffect(() => {
    initAuth();
  }, []);

  const initAuth = async () => {
    try {
      // TODO: Uncomment when packages are installed
       const authClient = await AuthClient.create();
       setAuthClient(authClient);
      
       if (await authClient.isAuthenticated()) {
         await handleAuthenticated(authClient);
       }
      
      console.log('Auth client would be initialized here');
      setError('Please install @dfinity packages and uncomment the auth code');
    } catch (error) {
      console.error('Auth initialization failed:', error);
      setError('Auth initialization failed: ' + error.message);
    }
  };

  const handleAuthenticated = async (authClient) => {
    try {
      // TODO: Uncomment when packages are installed
      const identity = authClient.getIdentity();
      const agent = new HttpAgent({ identity });
      
      // // Fetch root key for local development
      if (process.env.NODE_ENV !== 'production') {
        await agent.fetchRootKey();
      }
      
      const actor = Actor.createActor(idlFactory, {
      agent,
         canisterId: CANISTER_ID,
       });
      
       setActor(actor);
       setPrincipal(identity.getPrincipal().toString());
       setIsAuthenticated(true);
      
       await loadNotes();
       await loadBalance();
      
      console.log('Would create actor and authenticate here');
    } catch (error) {
      console.error('Authentication failed:', error);
      setError('Authentication failed: ' + error.message);
    }
  };

  const login = async () => {
    if (!authClient) {
      setError('Auth client not initialized');
      return;
    }
    
    try {
      setLoading(true);
      setError('');
      
      // TODO: Uncomment when packages are installed
       await authClient.login({
         identityProvider: II_URL,
         onSuccess: () => handleAuthenticated(authClient),
         onError: (error) => {
           console.error('Login error:', error);
           setError('Login failed: ' + error);
         }
       });
      
      console.log('Would login with Internet Identity here');
      setError('Login functionality requires @dfinity packages');
    } catch (error) {
      console.error('Login failed:', error);
      setError('Login failed: ' + error.message);
    }
    setLoading(false);
  };

  const logout = async () => {
    try {
      setLoading(true);
      
      // TODO: Uncomment when packages are installed
       if (authClient) {
         await authClient.logout();
       }
      
      setIsAuthenticated(false);
      setPrincipal(null);
      setActor(null);
      setNotes([]);
      setBalance(0);
      setError('');
      
      console.log('Logged out');
    } catch (error) {
      console.error('Logout failed:', error);
      setError('Logout failed: ' + error.message);
    }
    setLoading(false);
  };

  const loadNotes = async () => {
    if (!actor) return;
    
    setLoading(true);
    try {
      const notesList = await actor.list_notes();
      setNotes(notesList.map(([id, note]) => ({ 
        id: Number(id), 
        title: note.title, 
        content: note.content 
      })));
    } catch (error) {
      console.error('Error loading notes:', error);
      setError('Error loading notes: ' + error.message);
    }
    setLoading(false);
  };

  const loadBalance = async () => {
    if (!actor) return;
    
    try {
      const userBalance = await actor.balance_of();
      setBalance(Number(userBalance));
    } catch (error) {
      console.error('Error loading balance:', error);
      setError('Error loading balance: ' + error.message);
    }
  };

  const handleAddNote = async () => {
    if (!actor || !newNote.title.trim() || !newNote.content.trim()) return;

    setLoading(true);
    setError('');
    try {
      const id = BigInt(Date.now());
      const noteData = {
        title: newNote.title,
        content: newNote.content
      };
      
      const result = await actor.add_note(id, noteData);
      
      if ('Err' in result) {
        throw new Error(result.Err);
      }
      
      setNotes(prev => [...prev, { id: Number(id), ...noteData }]);
      setNewNote({ title: '', content: '' });
      setShowAddForm(false);
      await loadBalance();
    } catch (error) {
      console.error('Error adding note:', error);
      setError('Error adding note: ' + error.message);
    }
    setLoading(false);
  };

  const handleUpdateNote = async () => {
    if (!actor || !editingNote.title.trim() || !editingNote.content.trim()) return;

    setLoading(true);
    setError('');
    try {
      const noteData = {
        title: editingNote.title,
        content: editingNote.content
      };
      
      const result = await actor.update_note(BigInt(editingNote.id), noteData);
      
      if (result && result.length > 0) {
        setNotes(prev => prev.map(note => 
          note.id === editingNote.id ? editingNote : note
        ));
        setEditingNote(null);
      } else {
        throw new Error('Failed to update note');
      }
    } catch (error) {
      console.error('Error updating note:', error);
      setError('Error updating note: ' + error.message);
    }
    setLoading(false);
  };

  const handleDeleteNote = async (id) => {
    if (!actor || !confirm('Are you sure you want to delete this note?')) return;

    setLoading(true);
    setError('');
    try {
      const result = await actor.delete_note(BigInt(id));
      
      if ('Err' in result) {
        throw new Error(result.Err);
      }
      
      setNotes(prev => prev.filter(note => note.id !== id));
    } catch (error) {
      console.error('Error deleting note:', error);
      setError('Error deleting note: ' + error.message);
    }
    setLoading(false);
  };

  const refreshData = () => {
    loadNotes();
    loadBalance();
  };

  // Login screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">IC Notes</h1>
          <p className="text-gray-600 mb-8">
            A decentralized notes application on the Internet Computer
          </p>
          
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}
          
          <button
            onClick={login}
            disabled={loading}
            className="flex items-center justify-center space-x-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 w-full"
          >
            <LogIn className="w-5 h-5" />
            <span>{loading ? 'Connecting...' : 'Login with Internet Identity'}</span>
          </button>
          
          <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h3 className="font-semibold text-yellow-800 mb-2">Setup Required:</h3>
            <div className="text-sm text-yellow-700 text-left space-y-1">
              <p>1. Install dependencies:</p>
              <code className="block bg-yellow-100 p-2 rounded text-xs">
                npm install @dfinity/agent @dfinity/auth-client @dfinity/principal @dfinity/candid
              </code>
              <p>2. Replace CANISTER_ID with your actual canister ID</p>
              <p>3. Uncomment the import statements and auth code</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">IC Notes</h1>
              <p className="text-sm text-gray-600">Principal: {principal}</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 bg-green-50 px-3 py-2 rounded-lg">
                <Wallet className="w-5 h-5 text-green-600" />
                <span className="font-semibold text-green-800">{balance} tokens</span>
              </div>
              <button
                onClick={refreshData}
                disabled={loading}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={logout}
                className="flex items-center space-x-2 text-gray-600 hover:text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Add Note Button */}
        <div className="mb-6">
          <button
            onClick={() => setShowAddForm(true)}
            disabled={loading || balance < 10}
            className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            <Plus className="w-5 h-5" />
            <span>Add New Note (10 tokens)</span>
          </button>
          {balance < 10 && (
            <p className="text-red-600 text-sm mt-2">Insufficient balance to add notes</p>
          )}
        </div>

        {/* Add Note Form */}
        {showAddForm && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Add New Note</h2>
            <div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Title
                </label>
                <input
                  type="text"
                  value={newNote.title}
                  onChange={(e) => setNewNote(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter note title"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Content
                </label>
                <textarea
                  value={newNote.content}
                  onChange={(e) => setNewNote(prev => ({ ...prev, content: e.target.value }))}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter note content"
                />
              </div>
              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={handleAddNote}
                  disabled={loading || !newNote.title.trim() || !newNote.content.trim()}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400"
                >
                  {loading ? 'Adding...' : 'Add Note'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setNewNote({ title: '', content: '' });
                  }}
                  className="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Note Form */}
        {editingNote && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Edit Note</h2>
            <div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Title
                </label>
                <input
                  type="text"
                  value={editingNote.title}
                  onChange={(e) => setEditingNote(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Content
                </label>
                <textarea
                  value={editingNote.content}
                  onChange={(e) => setEditingNote(prev => ({ ...prev, content: e.target.value }))}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={handleUpdateNote}
                  disabled={loading || !editingNote.title.trim() || !editingNote.content.trim()}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400"
                >
                  {loading ? 'Updating...' : 'Update Note'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingNote(null)}
                  className="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Notes List */}
        <div className="space-y-4">
          {loading && notes.length === 0 ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-600 mt-2">Loading notes...</p>
            </div>
          ) : notes.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg shadow-sm">
              <p className="text-gray-600 text-lg">No notes yet</p>
              <p className="text-gray-500">Create your first note to get started!</p>
            </div>
          ) : (
            notes.map((note) => (
              <div key={note.id} className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex justify-between items-start mb-3">
                  <h3 className="text-xl font-semibold text-gray-900">{note.title}</h3>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setEditingNote(note)}
                      disabled={loading}
                      className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteNote(note.id)}
                      disabled={loading}
                      className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <p className="text-gray-700 whitespace-pre-wrap">{note.content}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default NotesApp;