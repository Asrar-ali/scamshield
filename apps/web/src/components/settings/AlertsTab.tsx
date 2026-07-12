import type { Contact, DiscordStatus, Settings } from '../../lib/api';
import { ContactsSection } from '../ContactsSection';

interface AlertsTabProps {
  settings: Settings;
  discordStatus: DiscordStatus;
  onContactsChange: (contacts: Contact[]) => void;
}

/** ALERTS tab — where scam reports get sent (Discord mod-log channel/person, or iMessage). */
export function AlertsTab({ settings, discordStatus, onContactsChange }: AlertsTabProps) {
  return <ContactsSection contacts={settings.contacts} discordStatus={discordStatus} onChange={onContactsChange} />;
}
