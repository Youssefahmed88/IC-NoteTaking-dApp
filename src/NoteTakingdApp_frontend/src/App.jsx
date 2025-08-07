import React, { useState, useEffect } from "react";
import { HttpAgent, Actor } from "@dfinity/agent";
import { Principal } from "@dfinity/principal";
import { AuthClient } from "@dfinity/auth-client";
import { idlFactory, canisterId } from "../../declarations/NoteTakingdApp_backend";
import { idlFactory as ledgerIdl, canisterId as ledgerId } from "../../declarations/icrc1_ledger_canister";

const App = () => {
  const [key, setKey] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [msg, setMsg] = useState("");
  const [note, setNote] = useState(null);
  const [notes, setNotes] = useState([]);
  const [backend, setBackend] = useState(null);
  const [amount, setAmount] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [authClient, setAuthClient] = useState(null);
  const [principal, setPrincipal] = useState(null);

  const login = async () => {
    const client = await AuthClient.create();
    setAuthClient(client);

    await client.login({
      identityProvider: "https://identity.ic0.app/#authorize",
        onSuccess: async () => {
          const identity = client.getIdentity();
          const principal = identity.getPrincipal();
          setPrincipal(principal);
          console.log("Logged in as:", principal.toText());

          const agent = new HttpAgent({ identity });
          await agent.fetchRootKey();
          const backendActor = Actor.createActor(idlFactory, {
            agent,
            canisterId,
          });
          setBackend(backendActor);
        },
      });
  };


  useEffect(() => {
  async function init() {
    let identity = undefined;

    if (authClient) {
      identity = authClient.getIdentity(); 
    }

    const agent = new HttpAgent({ identity }); // لو identity undefined هيشتغل anonymous عادي
    await agent.fetchRootKey();
    const backendActor = Actor.createActor(idlFactory, { agent, canisterId });
    setBackend(backendActor);

    try {
      const principal = await agent.getPrincipal();
      console.log("Principal:", principal.toText());
    } catch (err) {
      console.log("Anonymous user, no principal available yet.");
    }
  }

  init();
}, [authClient]); // ← ركز هنا، بقى يتفاعل مع تغير قيمة authClient


  const addNote = async () => {
    const res = await backend.add_note(BigInt(key), { title, content });

    if ("Ok" in res) {
      setMsg("Note added!");
      setNote({ title, content }); 
    } else {
      setMsg("Error: " + res.Err);
      setNote(null);
    }
  };


  const updateNote = async () => {
    const res = await backend.update_note(BigInt(key), { title, content });

    if ("Ok" in res) {
      setNote(res.Ok);
      setMsg("Note updated!");
    } else {
      setMsg("Error: " + res.Err);
    }
    console.log("Update response:", res);
  };

  const getNote = async () => {
    const res = await backend.get_note(BigInt(key));

    if (Array.isArray(res) && res.length > 0) {
      setNote(res[0]);
      setMsg("Note found!");
    } else {
      setNote(null);
      setMsg("Note not found.");
    }
  };

  const listNotes = async () => {
    const res = await backend.list_notes();
    setNotes(res);
    setNote({ title, content }); 
  };

  const deleteNote = async () => {
    const res = await backend.delete_note(BigInt(key));
    if ("Ok" in res) {
      setMsg(res.Ok);
      setNote({ title, content }); 
    } else {
      setMsg("Error: " + res.Err);
      setNote(null);
    }
  };

  const approveSpending = async () => {
    const agent = new HttpAgent();
    await agent.fetchRootKey();

    const ledgerActor = Actor.createActor(ledgerIdl, {
      agent,
      canisterId: ledgerId,
    });

    try {
      const amt = BigInt(amount);
      const expiresOpt = expiresAt ? [BigInt(expiresAt)] : [];
      const res = await ledgerActor.icrc2_approve({
        from_subaccount: [], // null
        spender: {
          owner: Principal.fromText("uzt4z-lp777-77774-qaabq-cai"), // backend canister
          subaccount: [], // null
        },
        amount: amt,
        expires_at: expiresOpt,
        expected_allowance: [],
        fee: [],
        memo: [],
        created_at_time: [],
      });

      console.log("Approval result:", res);
      setMsg("Approval " + ("Ok" in res ? "successful!" : "failed: " + res.Err));
    } catch (err) {
      console.error(err);
      setMsg("Error approving: " + err.message);
    }
  };

return (
  <div>
    <h1>Note Taking dApp</h1>

    <div style={{ marginBottom: "2rem" }}>
      <h2>Manage Notes</h2>
      <input value={key} onChange={e => setKey(e.target.value)} placeholder="Key" />
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" />
      <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Content" />
      <br />
      <button onClick={addNote}>Add</button>
      <button onClick={updateNote}>Update</button>
      <button onClick={getNote}>Get</button>
      <button onClick={listNotes}>List</button>
      <button onClick={deleteNote}>Delete</button>
      <br/>
      <p>{msg}</p>
      {note && (
        <div>
          <h3>Note:</h3>
          <p><strong>ID:</strong> {key}</p>
          <p><strong>Title:</strong> {note.title}</p>
          <p><strong>Content:</strong> {note.content}</p>
        </div>
      )}
    </div>
    <div>
      {notes.length > 0 && (
        <div>
          <h3>All Notes:</h3>
          {notes.map(([id, n]) => (
            <div key={id.toString()}>
              <p><strong>ID:</strong> {id.toString()}</p>
              <p><strong>Title:</strong> {n.title}</p>
              <p><strong>Content:</strong> {n.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>    

    <div>
      <h2>Approve Token Spending</h2>
      <input 
        type="number" 
        value={amount} 
        onChange={e => setAmount(e.target.value)} 
        placeholder="Amount"
      />
      <input
        type="number"
        value={expiresAt}
        onChange={e => setExpiresAt(e.target.value)}
        placeholder="Expires At (timestamp)"
      />
      <br />
      <button onClick={approveSpending}>Approve Spending</button>
      <br />
      <p>{msg}</p>
    </div>

      <div>
        {!principal ? (
        <button onClick={login}>Login with Internet Identity</button>
        ) : (
        <p>Logged in as: {principal.toText()}</p>
      )}
    </div>
  </div>
  );
};

export default App;