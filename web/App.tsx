import { useEffect, useState } from "react";
import { MessageConsole } from "./MessageConsole.js";
import type { Action, Device, HistoryEntry, Operation } from "../src/types.js";

type Detail = Operation & { history: HistoryEntry[] };
async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url,init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}
function title(value: string) { return value[0].toUpperCase()+value.slice(1); }
function label(status: Operation["status"]) {
  return status === "processing" ? "Succeeded" : title(status);
}
export function App() {
  const [devices,setDevices] = useState<Device[]>([]);
  const [operations,setOperations] = useState<Operation[]>([]);
  const [deviceId,setDeviceId] = useState("DEV-1001");
  const [action,setAction] = useState<Action>("activate");
  const [key,setKey] = useState(() => crypto.randomUUID() as string);
  const [selected,setSelected] = useState<string | null>(null);
  const [detail,setDetail] = useState<Detail | null>(null);
  const [loadError,setLoadError] = useState("");
  const [submitError,setSubmitError] = useState("");
  const [loading,setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const options = { signal: controller.signal };
        const [nextDevices,nextOperations,nextDetail] = await Promise.all([
          json<Device[]>("/api/devices",options),
          json<Operation[]>("/api/operations",options),
          selected ? json<Detail>(`/api/operations/${selected}`,options) : Promise.resolve(null),
        ]);
        if (controller.signal.aborted) return;
        setDevices(nextDevices); setOperations(nextOperations); setDetail(nextDetail);
        setLoadError("");
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : "Could not load operations");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          timer = setTimeout(() => { void refresh(); },1000);
        }
      }
    }
    setDetail(null);
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  },[selected]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitError("");
    try {
      const operation = await json<Operation>("/api/operations",{
        method: "POST",
        headers: { "Content-Type": "application/json","Idempotency-Key": key },
        body: JSON.stringify({ deviceId,action }),
      });
      setSelected(operation.id);
      setOperations(current => [operation,...current.filter(item => item.id !== operation.id)]);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Request failed");
    }
  }
  const device = devices.find(item => item.id === deviceId);
  return <main>
    <header><p className="eyebrow">Operations / demo environment</p><h1>Device service console</h1>
      <p>Manage device lifecycle and outbound message delivery.</p></header>
    <p className="notice">Synthetic devices only. This application is not a production service.</p>
    {loadError ? <p role="alert" className="error">{loadError}</p> : null}
    <div className="layout">
      <section aria-labelledby="new-heading"><h2 id="new-heading">New operation</h2>
        <form onSubmit={event => { void submit(event); }}>
          <label htmlFor="device">Device</label>
          <select id="device" value={deviceId} onChange={event => {
            setDeviceId(event.target.value); setKey(crypto.randomUUID()); setSubmitError("");
          }}>
            {devices.map(item => <option key={item.id} value={item.id}>{item.name} ({item.id})</option>)}
          </select>
          <p>Device state: <strong data-testid="device-state">{device ? title(device.state) : "Loading…"}</strong></p>
          <label htmlFor="action">Action</label>
          <select id="action" value={action} onChange={event => {
            setAction(event.target.value as Action); setKey(crypto.randomUUID()); setSubmitError("");
          }}>
            <option value="activate">Activate</option><option value="deactivate">Deactivate</option>
          </select>
          <label htmlFor="key">Request key</label>
          <input id="key" value={key} onChange={event => setKey(event.target.value)} required maxLength={80} pattern="[a-zA-Z0-9_-]{1,80}" />
          <p className="hint">Reference associated with this operation.</p>
          {submitError ? <p role="alert" className="error">{submitError}</p> : null}
          <div className="actions">
            <button disabled={devices.length === 0} type="submit">{`Request ${action === "activate" ? "activation" : "deactivation"}`}</button>
            <button type="button" className="secondary" onClick={() => setKey(crypto.randomUUID())}>New key</button>
          </div>
        </form>
      </section>
      <section aria-labelledby="requests-heading"><h2 id="requests-heading">Operation requests</h2>
        {loading ? <p role="status">Loading operations…</p> : operations.length === 0 ? <p>No operations yet. Submit an operation to begin.</p> :
          <div className="table-wrap"><table><thead><tr><th>Device</th><th>Action</th><th>Status</th><th>Operation ID</th><th>Request key</th></tr></thead><tbody>
            {operations.map(item => <tr key={item.id}>
              <td>{item.deviceId}</td><td>{title(item.action)}</td>
              <td><span className={`status ${item.status}`}>{label(item.status)}</span></td>
              <td><button type="button" className="link" title={item.id} aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}>{item.id.slice(0,8)}</button></td>
              <td className="request-key"><code>{item.idempotencyKey}</code></td>
            </tr>)}
          </tbody></table></div>}
      </section>
    </div>
    {selected ? <section className="detail" aria-labelledby="detail-heading"><h2 id="detail-heading">Operation detail</h2>
      {detail ? <><dl><dt>Operation ID</dt><dd>{detail.id}</dd><dt>Request key</dt><dd>{detail.idempotencyKey}</dd>
        <dt>Action</dt><dd>{title(detail.action)}</dd>
        <dt>Operation status</dt><dd>{label(detail.status)}</dd>
        <dt>Provider reference</dt><dd>{detail.providerReference ?? "Not available"}</dd>
        <dt>Error</dt><dd>{detail.error ?? "None recorded"}</dd></dl>
        <h3>History</h3><ol>{detail.history.map((item,index) => <li key={index}><time>{new Date(item.createdAt).toLocaleTimeString()}</time> — {item.message} <span className="hint">({label(item.status)})</span></li>)}</ol></> : <p>Loading detail…</p>}
    </section> : null}
    <MessageConsole devices={devices} />
    <footer>Updates every second · Local mock provider · No real network operations</footer>
  </main>;
}
