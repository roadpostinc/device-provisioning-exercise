import { useEffect,useState } from "react";
import type { Device } from "../src/types.js";
import { createMessageApi,type FormKind,type MessageView } from "./message-api.js";

const api = createMessageApi();
export function MessageConsole({ devices }: { devices: Device[] }) {
  const [deviceId,setDeviceId] = useState("DEV-1001");
  const [kind,setKind] = useState<FormKind>("chat");
  const [text,setText] = useState("Hello from operations");
  const [description,setDescription] = useState("");
  const [latitude,setLatitude] = useState("");
  const [longitude,setLongitude] = useState("");
  const [key,setKey] = useState(() => crypto.randomUUID() as string);
  const [messages,setMessages] = useState<MessageView[]>([]);
  const [selected,setSelected] = useState<string | null>(null);
  const [detail,setDetail] = useState<MessageView | null>(null);
  const [eventKind,setEventKind] = useState<"receipt" | "pong">("receipt");
  const [loading,setLoading] = useState(true);
  const [loadError,setLoadError] = useState("");
  const [actionError,setActionError] = useState("");
  const [notice,setNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const [next,nextDetail] = await Promise.all([
          api.list(controller.signal),
          selected ? api.get(selected,controller.signal) : Promise.resolve(null),
        ]);
        if (controller.signal.aborted) return;
        setMessages(next); setDetail(nextDetail); setLoadError("");
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "Could not load messages");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          timer = setTimeout(() => { void refresh(); },1000);
        }
      }
    }
    setDetail(null); void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  },[selected]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setActionError(""); setNotice("");
    const fields: Record<string,string> = kind === "chat" ? { text } :
      kind === "sos" ? { description,latitude,longitude } : {};
    try {
      const message = await api.submit({ deviceId,kind,requestKey: key,fields });
      setMessages(current => [message,...current.filter(item => item.id !== message.id)]);
      setSelected(message.id); setEventKind(kind === "sonar" ? "pong" : "receipt");
      setNotice("Request accepted");
    } catch (error) { setActionError(error instanceof Error ? error.message : "Message request failed"); }
  }
  async function receiveEvent() {
    if (!detail) return;
    setActionError(""); setNotice("");
    try {
      const evidence = await api.generateEvent(detail.id,eventKind);
      const updated = await api.recordEvent(evidence);
      setDetail(updated); setNotice("Device event recorded");
    } catch (error) { setActionError(error instanceof Error ? error.message : "Device event failed"); }
  }
  return <div className="message-console">
    <h2>Messages</h2>
    <p className="notice">Chat, SOS, and Sonar use synthetic gateways only. SOS does not contact emergency responders.</p>
    {loadError ? <p role="alert" className="error">{loadError}</p> : null}
    {actionError ? <p role="alert" className="error">{actionError}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    <div className="layout">
      <section aria-labelledby="send-heading"><h3 id="send-heading">Send a message</h3>
        <form onSubmit={event => { void submit(event); }}>
          <label htmlFor="message-device">Message device</label>
          <select id="message-device" value={deviceId} onChange={event => {
            setDeviceId(event.target.value); setKey(crypto.randomUUID()); setActionError("");
          }}>
            {devices.map(device => <option key={device.id} value={device.id}>{device.id} — {device.state}</option>)}
          </select>
          <label htmlFor="message-kind">Message type</label>
          <select id="message-kind" value={kind} onChange={event => {
            setKind(event.target.value as FormKind); setKey(crypto.randomUUID()); setActionError(""); setNotice("");
          }}>
            <option value="chat">Chat</option><option value="sos">SOS</option><option value="sonar">Sonar</option>
          </select>
          {kind === "chat" ? <><label htmlFor="message-text">Chat text</label>
            <textarea id="message-text" rows={3} value={text} onChange={event => setText(event.target.value)} />
</> : null}
          {kind === "sos" ? <><label htmlFor="sos-description">SOS description (optional)</label>
            <textarea id="sos-description" rows={2} value={description} onChange={event => setDescription(event.target.value)} />
            <label htmlFor="sos-latitude">Latitude (optional)</label>
            <input id="sos-latitude" inputMode="decimal" value={latitude} onChange={event => setLatitude(event.target.value)} />
            <label htmlFor="sos-longitude">Longitude (optional)</label>
            <input id="sos-longitude" inputMode="decimal" value={longitude} onChange={event => setLongitude(event.target.value)} /></> : null}
          <label htmlFor="message-key">Message request key</label>
          <input id="message-key" value={key} onChange={event => setKey(event.target.value)} required maxLength={80} pattern="[a-zA-Z0-9_-]{1,80}" />
          <div className="actions"><button type="submit" disabled={!devices.length}>Send {kind === "sos" ? "SOS" : kind === "sonar" ? "Sonar" : "Chat"}</button>
            <button type="button" className="secondary" onClick={() => setKey(crypto.randomUUID())}>New message key</button></div>
        </form>
      </section>
      <section aria-labelledby="messages-heading"><h3 id="messages-heading">Message requests</h3>
        {loading ? <p role="status">Loading messages…</p> : !messages.length ? <p>No messages yet.</p> :
          <div className="table-wrap"><table data-testid="message-table"><thead><tr><th>Device</th><th>Type</th><th>Status</th><th>Message ID</th></tr></thead>
            <tbody>{messages.map(message => <tr key={message.id}><td>{message.deviceId}</td><td>{message.kind}</td>
              <td><span className={`status ${message.status}`}>{message.status}</span></td>
              <td><button type="button" className="link" title={message.id} aria-pressed={selected === message.id} onClick={() => setSelected(message.id)}>{message.id.slice(0,8)}</button></td>
            </tr>)}</tbody></table></div>}
      </section>
    </div>
    {selected ? <section className="detail" aria-labelledby="message-detail-heading"><h3 id="message-detail-heading">Message detail</h3>
      {detail ? <><dl><dt>Message ID</dt><dd>{detail.id}</dd><dt>Request key</dt><dd>{detail.requestKey}</dd>
        <dt>Device</dt><dd>{detail.deviceId}</dd><dt>Type</dt><dd>{detail.kind}</dd><dt>Status</dt><dd>{detail.status}</dd>
        <dt>Summary</dt><dd>{detail.summary ?? "Not available"}</dd><dt>Transport</dt><dd>{detail.transport ?? "Not selected"}</dd>
        <dt>Gateway reference</dt><dd>{detail.gatewayReference ?? "Not available"}</dd><dt>Error</dt><dd>{detail.error ?? "None recorded"}</dd></dl>
        {detail.details === undefined ? null : <pre className="payload">{JSON.stringify(detail.details,null,2)}</pre>}
        <label htmlFor="device-event">Synthetic device event</label>
        <select id="device-event" value={eventKind} onChange={event => setEventKind(event.target.value as "receipt" | "pong")}>
          <option value="receipt">Delivery receipt</option><option value="pong">Sonar pong</option>
        </select>
        <div className="actions"><button type="button" className="secondary" onClick={() => { void receiveEvent(); }}>Receive device event</button></div>
        <h3>Message history</h3><ol>{(detail.history ?? []).map((event,index) => <li key={index}>{event.createdAt} — {event.detail} ({event.status})</li>)}</ol>
      </> : <p>Loading message detail…</p>}
    </section> : null}
  </div>;
}
