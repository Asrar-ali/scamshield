import { useState, type FormEvent } from 'react';
import type { AlertTestResponse, Contact, DiscordStatus } from '../lib/api';
import { postAlertTest } from '../lib/api';
import { CheckIcon, CrossIcon, DiscordIcon, MessageIcon } from './icons';

const MAX_CONTACTS = 5;

interface ContactsSectionProps {
  contacts: Contact[];
  discordStatus: DiscordStatus;
  onChange: (contacts: Contact[]) => void;
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `contact-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function channelLabel(channel: Contact['channel']): string {
  return channel === 'discord' ? 'Discord' : 'iMessage';
}

function ChannelGlyph({ channel }: { channel: Contact['channel'] }) {
  return channel === 'discord' ? <DiscordIcon width={13} height={13} /> : <MessageIcon width={13} height={13} />;
}

export function ContactsSection({ contacts, discordStatus, onChange }: ContactsSectionProps) {
  const [name, setName] = useState('');
  const [channel, setChannel] = useState<Contact['channel']>('discord');
  const [address, setAddress] = useState('');
  const [sending, setSending] = useState(false);
  const [testResult, setTestResult] = useState<AlertTestResponse | 'error' | null>(null);

  const atLimit = contacts.length >= MAX_CONTACTS;

  const addContact = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim() || !address.trim() || atLimit) return;
    onChange([...contacts, { id: makeId(), name: name.trim(), channel, address: address.trim() }]);
    setName('');
    setAddress('');
  };

  const removeContact = (id: string) => onChange(contacts.filter((c) => c.id !== id));

  const sendTest = async () => {
    setSending(true);
    const result = await postAlertTest();
    setTestResult(result ?? 'error');
    setSending(false);
  };

  return (
    <div className="settings-section">
      <div className="settings-section-head">
        <h3>Alert Contacts</h3>
        <span className="settings-section-count">
          {contacts.length} / {MAX_CONTACTS}
        </span>
      </div>

      <div className="contact-list">
        {contacts.length === 0 && <p className="empty">No contacts yet — add a mod-log channel or person to notify.</p>}
        {contacts.map((c) => (
          <div key={c.id} className="contact-row">
            <span className={`channel-badge channel-badge--${c.channel}`}>
              <ChannelGlyph channel={c.channel} />
              {channelLabel(c.channel)}
            </span>
            <span className="contact-name">{c.name}</span>
            <span className="contact-address">{c.address}</span>
            <button type="button" className="contact-remove" onClick={() => removeContact(c.id)} aria-label={`Remove ${c.name}`}>
              <CrossIcon width={13} height={13} />
            </button>
          </div>
        ))}
      </div>

      {atLimit ? (
        <p className="settings-hint">Maximum {MAX_CONTACTS} alert contacts.</p>
      ) : (
        <form className="add-contact-form" onSubmit={addContact}>
          <div className="add-contact-row">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Contact name" />
            <select value={channel} onChange={(e) => setChannel(e.target.value as Contact['channel'])} aria-label="Contact channel">
              <option value="discord">Discord</option>
              <option value="imessage">iMessage</option>
            </select>
          </div>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={channel === 'discord' ? 'Channel ID or user ID' : 'Phone or email'}
            aria-label="Contact address"
          />

          {channel === 'discord' ? (
            discordStatus.recentUsers.length > 0 ? (
              <div className="chat-suggestions">
                {discordStatus.recentUsers.map((user) => (
                  <button
                    key={user.userId}
                    type="button"
                    className="suggestion-chip"
                    onClick={() => {
                      setAddress(user.userId);
                      if (!name.trim()) setName(user.name);
                    }}
                  >
                    {user.name} — user {user.userId}
                  </button>
                ))}
              </div>
            ) : (
              <p className="settings-hint">
                {discordStatus.botTag
                  ? `Bot is online as ${discordStatus.botTag} in ${discordStatus.guildName ?? 'your server'}.`
                  : 'Discord bot is not connected yet.'}
              </p>
            )
          ) : (
            <p className="settings-hint">Sends from this Mac&apos;s Messages app (demo feature).</p>
          )}

          <button type="submit" className="add-contact-submit" disabled={!name.trim() || !address.trim()}>
            Add contact
          </button>
        </form>
      )}

      <div className="test-alert-block">
        <button type="button" className="test-alert-btn" onClick={sendTest} disabled={sending || contacts.length === 0}>
          {sending ? 'Sending…' : 'Send test alert'}
        </button>
        {testResult === 'error' && <p className="settings-hint settings-hint--error">Couldn&apos;t reach the alert service.</p>}
        {testResult && testResult !== 'error' && (
          <div className="test-results">
            {testResult.deliveries.map((d, i) => (
              <div key={i} className={`test-result ${d.ok ? 'ok' : 'fail'}`}>
                {d.ok ? <CheckIcon width={13} height={13} /> : <CrossIcon width={13} height={13} />}
                <ChannelGlyph channel={d.channel} />
                <span>{d.ok ? `${d.contact} delivered` : `${d.contact} failed${d.error ? `: ${d.error}` : ''}`}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
