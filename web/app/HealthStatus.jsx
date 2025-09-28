"use client";

import { useEffect, useState } from "react";

export default function HealthStatus() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    fetch("http://localhost:4000/health")
      .then(r => r.json())
      .then(setData)
      .catch(e => setErr(e.message));
  }, []);

  if (err) return <p style={{color:"crimson"}}>Error: {err}</p>;
  if (!data) return <p>Checking API health…</p>;

  return (
    <pre style={{background:"#f5f5f5", padding:12, borderRadius:8}}>
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
