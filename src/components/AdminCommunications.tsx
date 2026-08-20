import { useCallback, useEffect, useState } from 'react';
import { Bell, Mail, RefreshCw, Send, Settings } from 'lucide-react';
import { apiRequest } from '../lib/api';
import AdminSecurity from './AdminSecurity';

export default function AdminCommunications({ users }: { users: any[] }) {
  const [section, setSection] = useState<'email' | 'notifications' | 'security'>('email');
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [sendToAll, setSendToAll] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState<any>({ smtp_port: 587, smtp_secure: false });
  const [email, setEmail] = useState({ subject: '', message: '' });
  const [notification, setNotification] = useState({ title: '', message: '', type: 'INFO', action_link: '' });
  const [logs, setLogs] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      const [savedSettings, emailLogs] = await Promise.all([
        apiRequest<any>('/api/v1/admin/email/settings'),
        apiRequest<any[]>('/api/v1/admin/email/logs')
      ]);
      setSettings(current => ({ ...current, ...(savedSettings || {}) }));
      setLogs(emailLogs);
    } catch (err: any) {
      setMessage(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const recipientPayload = { send_to_all: sendToAll, user_ids: selectedUsers };
  const toggleUser = (id: number) => setSelectedUsers(ids => ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id]);

  const run = async (action: () => Promise<any>, success: string) => {
    setBusy(true); setMessage('');
    try { await action(); setMessage(success); await load(); }
    catch (err: any) { setMessage(err.message); }
    finally { setBusy(false); }
  };

  const usesZoho = settings.delivery_provider === 'ZOHO_API';
  const saveSettings = () => run(() => apiRequest('/api/v1/admin/email/settings', {
    method: 'PUT', body: JSON.stringify(settings)
  }), 'SMTP settings saved.');

  const sendEmail = async () => {
    setBusy(true); setMessage('');
    try {
      const result = await apiRequest<any>('/api/v1/admin/email/send', {
        method: 'POST',
        body: JSON.stringify({ ...email, ...recipientPayload })
      });
      setMessage(
        result.failed_count
          ? `Email finished: ${result.sent_count} sent, ${result.failed_count} failed. Check delivery history below.`
          : `Email sent successfully to ${result.sent_count} recipient${result.sent_count === 1 ? '' : 's'}.`
      );
      await load();
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const sendNotification = () => run(() => apiRequest('/api/v1/admin/notifications', {
    method: 'POST', body: JSON.stringify({ ...notification, ...recipientPayload })
  }), 'In-app notification sent.');

  return <div className="min-w-0 space-y-4 sm:space-y-6">
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {[{ id: 'email', label: 'Email management', icon: Mail }, { id: 'notifications', label: 'In-app notifications', icon: Bell }, { id: 'security', label: 'Security', icon: Settings }].map(item =>
        <button key={item.id} onClick={() => setSection(item.id as any)} className={`flex w-full items-center justify-center gap-2 rounded-xl px-3 py-3 text-xs font-bold ${section === item.id ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-500'}`}><item.icon className="h-4 w-4 shrink-0" /><span className="truncate">{item.label}</span></button>)}
    </div>
    {message && <div className="break-words rounded-2xl border border-blue-100 bg-blue-50 p-3 text-xs font-bold text-[#003399] sm:p-4 sm:text-sm">{message}</div>}

    {section === 'email' && <div className="grid min-w-0 gap-4 xl:grid-cols-2 xl:gap-6">
      <div className="min-w-0 space-y-4 rounded-2xl border border-slate-100 bg-white p-4 sm:rounded-[2rem] sm:p-6">
        <h3 className="font-extrabold flex items-center gap-2"><Settings className="w-5 h-5 text-[#003399]" /> {usesZoho ? 'Zoho Mail API' : 'SMTP configuration'}</h3>
        {usesZoho && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-700">Zoho Mail is connected through Railway using secure HTTPS.</div>}
        {!usesZoho && <><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[['smtp_host','SMTP host'],['smtp_port','Port'],['smtp_username','Username'],['smtp_password','Password'],['sender_email','Sender email'],['sender_name','Sender name']].map(([key,label]) =>
            <div key={key}><label className="form-label">{label}</label><input type={key === 'smtp_password' ? 'password' : key === 'smtp_port' ? 'number' : 'text'} value={settings[key] || ''} onChange={e => setSettings((value: any) => ({ ...value, [key]: e.target.value }))} placeholder={key === 'smtp_password' && settings.has_password ? 'Saved — leave blank to keep' : label} className="field-control" /></div>)}
        </div>
        <label className="flex items-start gap-2 text-xs font-bold text-slate-600"><input className="mt-0.5 shrink-0" type="checkbox" checked={!!settings.smtp_secure} onChange={e => setSettings((value: any) => ({ ...value, smtp_secure: e.target.checked }))} /><span>Use secure TLS connection</span></label>
        </>}
        <div className="flex flex-col gap-2 sm:flex-row">{!usesZoho && <button disabled={busy} onClick={saveSettings} className="w-full rounded-xl bg-[#003399] py-3 text-xs font-bold text-white sm:flex-1">Save settings</button>}<button disabled={busy} onClick={() => run(() => apiRequest('/api/v1/admin/email/test', { method: 'POST' }), 'Email provider connection verified.')} className="w-full rounded-xl bg-slate-100 px-4 py-3 text-xs font-bold sm:w-auto">Test connection</button></div>
      </div>
      <div className="min-w-0 space-y-4 rounded-2xl border border-slate-100 bg-white p-4 sm:rounded-[2rem] sm:p-6">
        <h3 className="font-extrabold flex items-center gap-2"><Send className="w-5 h-5 text-[#003399]" /> Compose email</h3>
        <RecipientPicker users={users} selected={selectedUsers} sendToAll={sendToAll} onAll={setSendToAll} onToggle={toggleUser} />
        <p className="text-xs leading-5 text-slate-500">Messages use the Blue Crest email design and greet each recipient by first name.</p>
        <input value={email.subject} onChange={e => setEmail(value => ({ ...value, subject: e.target.value }))} className="field-control" placeholder="Email subject" />
        <textarea value={email.message} onChange={e => setEmail(value => ({ ...value, message: e.target.value }))} className="w-full min-h-36 field-control py-3" placeholder="Write your message…" />
        <button disabled={busy} onClick={sendEmail} className="w-full py-3 bg-slate-900 text-white rounded-xl text-xs font-bold">{busy ? 'Sending…' : 'Send email'}</button>
      </div>
      <div className="min-w-0 rounded-2xl border border-slate-100 bg-white p-4 sm:rounded-[2rem] sm:p-6 xl:col-span-2">
        <div className="mb-4 flex items-center justify-between gap-3"><h3 className="font-extrabold">Delivery history</h3><button onClick={load} aria-label="Refresh delivery history" className="rounded-lg p-2 hover:bg-slate-50"><RefreshCw className="h-4 w-4 text-slate-400" /></button></div>
        <div className="space-y-3 sm:hidden">{logs.map(log => <div key={log.id} className="min-w-0 rounded-xl border border-slate-100 p-3 text-xs"><div className="flex items-start justify-between gap-3"><p className="min-w-0 break-all font-bold text-slate-700">{log.recipient_email}</p><span className={`shrink-0 font-bold ${log.status === 'SENT' ? 'text-emerald-600' : log.status === 'FAILED' ? 'text-rose-600' : 'text-slate-500'}`}>{log.status}</span></div><p className="mt-2 break-words text-slate-600">{log.subject}</p><p className="mt-2 text-[10px] text-slate-400">{new Date(log.created_at).toLocaleString()}</p></div>)}{logs.length === 0 && <p className="py-6 text-center text-xs text-slate-400">No email deliveries yet.</p>}</div>
        <div className="hidden overflow-x-auto sm:block"><table className="w-full min-w-[640px] text-left text-xs"><thead><tr className="text-slate-400 uppercase"><th className="py-3">Recipient</th><th>Subject</th><th>Status</th><th>Date</th></tr></thead><tbody>{logs.map(log => <tr key={log.id} className="border-t border-slate-50"><td className="py-3 pr-4">{log.recipient_email}</td><td className="max-w-xs break-words pr-4">{log.subject}</td><td className={log.status === 'SENT' ? 'text-emerald-600 font-bold' : log.status === 'FAILED' ? 'text-rose-600 font-bold' : ''}>{log.status}</td><td className="whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td></tr>)}</tbody></table></div>
      </div>
    </div>}

    {section === 'notifications' && <div className="min-w-0 max-w-3xl space-y-4 rounded-2xl border border-slate-100 bg-white p-4 sm:rounded-[2rem] sm:p-6">
      <h3 className="font-extrabold flex items-center gap-2"><Bell className="w-5 h-5 text-[#003399]" /> Create notification</h3>
      <RecipientPicker users={users} selected={selectedUsers} sendToAll={sendToAll} onAll={setSendToAll} onToggle={toggleUser} />
      <div className="grid sm:grid-cols-[1fr_180px] gap-3"><input className="field-control" placeholder="Notification title" value={notification.title} onChange={e => setNotification(value => ({ ...value, title: e.target.value }))} /><select className="field-control" value={notification.type} onChange={e => setNotification(value => ({ ...value, type: e.target.value }))}><option>INFO</option><option>SUCCESS</option><option>WARNING</option><option>SECURITY</option></select></div>
      <textarea className="w-full min-h-36 field-control py-3" placeholder="Notification message" value={notification.message} onChange={e => setNotification(value => ({ ...value, message: e.target.value }))} />
      <input className="field-control" placeholder="Optional action link, e.g. /cards" value={notification.action_link} onChange={e => setNotification(value => ({ ...value, action_link: e.target.value }))} />
      <button disabled={busy} onClick={sendNotification} className="w-full py-3 bg-[#003399] text-white rounded-xl text-xs font-bold">{busy ? 'Sending…' : 'Send notification'}</button>
    </div>}

    {section === 'security' && <AdminSecurity users={users} />}
  </div>;
}

function RecipientPicker({ users, selected, sendToAll, onAll, onToggle }: { users: any[]; selected: number[]; sendToAll: boolean; onAll: (value: boolean) => void; onToggle: (id: number) => void }) {
  return <div className="min-w-0 space-y-2"><label className="flex items-center gap-2 text-xs font-bold text-slate-600"><input className="shrink-0" type="checkbox" checked={sendToAll} onChange={e => onAll(e.target.checked)} /> Send to all users</label>
    {!sendToAll && <div className="grid max-h-44 min-w-0 grid-cols-1 gap-1 overflow-y-auto rounded-xl border border-slate-200 p-2 sm:grid-cols-2">{users.filter(user => user.role !== 'ADMIN').map(user => <label key={user.id} className="flex min-w-0 items-start gap-2 rounded-lg p-2 text-xs hover:bg-slate-50"><input className="mt-0.5 shrink-0" type="checkbox" checked={selected.includes(Number(user.id))} onChange={() => onToggle(Number(user.id))} /><span className="min-w-0 break-words">{user.first_name} {user.last_name}<span className="block break-all text-[10px] text-slate-400">{user.email}</span></span></label>)}</div>}</div>;
}
