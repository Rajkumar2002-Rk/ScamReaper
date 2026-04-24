export type CallStatus = 'scam' | 'legitimate' | 'unsure';

export type CallEntry = {
  id: string;
  number: string;
  callerName?: string;
  claim: string;
  status: CallStatus;
  time: string;
  timestamp: number;
  verdict: string;
  transcript: { speaker: 'caller' | 'ai' | 'system'; text: string }[];
  // Phase 4 metadata — all optional so older stored entries stay valid.
  language?: string;        // e.g. "English" / "Spanish" / "Unknown"
  languageCode?: string;    // e.g. "en" / "es" / "unknown"
  lowConfidence?: boolean;
  bypassFlagged?: boolean;
  rageModeUsed?: boolean;
  rageModeLanguage?: string;
};

export const STATUS_CONFIG: Record<
  CallStatus,
  { color: string; label: string; emoji: string; badgeLabel: string }
> = {
  scam: {
    color: '#ff3b30',
    label: 'SCAM',
    emoji: '🔴',
    badgeLabel: 'SCAM BLOCKED',
  },
  legitimate: {
    color: '#30d158',
    label: 'LEGIT',
    emoji: '🟢',
    badgeLabel: 'LEGITIMATE',
  },
  unsure: {
    color: '#ffd60a',
    label: 'UNSURE',
    emoji: '🟡',
    badgeLabel: 'UNSURE',
  },
};

export const SAMPLE_CALLS: CallEntry[] = [
  {
    id: '1',
    number: '+1 (202) 555-0178',
    callerName: 'Unknown Caller',
    claim: 'IRS tax debt — immediate payment required',
    status: 'scam',
    time: '2 hours ago',
    timestamp: Date.now() - 2 * 60 * 60 * 1000,
    verdict:
      'Classic IRS impersonation scam. The IRS never demands immediate payment over the phone, threatens arrest, or asks for gift cards or wire transfers. ScamReaper detected urgency language, payment demands, and threats of legal action.',
    transcript: [
      { speaker: 'system', text: 'Call auto-answered by iOS Call Screening' },
      {
        speaker: 'ai',
        text: 'Hello, who is calling please?',
      },
      {
        speaker: 'caller',
        text:
          'This is Officer Daniels from the IRS. You have unpaid taxes and a warrant has been issued for your arrest. You must pay $2,400 immediately via gift cards or you will be arrested today.',
      },
      {
        speaker: 'ai',
        text: 'Can you confirm your badge number and the official IRS case number?',
      },
      {
        speaker: 'caller',
        text: 'There is no time for that. Go to the nearest store and buy gift cards now or you will go to jail.',
      },
      { speaker: 'system', text: 'ScamReaper verdict: RED — Scam detected' },
    ],
  },
  {
    id: '2',
    number: '+1 (800) 123-4567',
    callerName: "Dr. Patel's Office",
    claim: 'Doctor appointment reminder for Thursday 3pm',
    status: 'legitimate',
    time: '5 hours ago',
    timestamp: Date.now() - 5 * 60 * 60 * 1000,
    verdict:
      'Legitimate appointment reminder. Caller provided clinic name, specific appointment details, and did not request payment or personal information. Tone and script match a standard healthcare reminder.',
    transcript: [
      { speaker: 'system', text: 'Call auto-answered by iOS Call Screening' },
      { speaker: 'ai', text: 'Hello, who is calling please?' },
      {
        speaker: 'caller',
        text:
          "Hi, this is Maria from Dr. Patel's office calling to confirm your appointment this Thursday at 3pm. Please call us back at 800-123-4567 if you need to reschedule.",
      },
      { speaker: 'system', text: 'ScamReaper verdict: GREEN — Legitimate call' },
    ],
  },
  {
    id: '3',
    number: 'Unknown',
    callerName: 'Unidentified',
    claim: 'Refused to identify company or reason for call',
    status: 'unsure',
    time: 'Yesterday',
    timestamp: Date.now() - 26 * 60 * 60 * 1000,
    verdict:
      'Caller would not identify themselves or their company. ScamReaper requested an official email for verification. Awaiting confirmation before allowing future calls through.',
    transcript: [
      { speaker: 'system', text: 'Call auto-answered by iOS Call Screening' },
      { speaker: 'ai', text: 'Hello, who is calling please?' },
      { speaker: 'caller', text: 'I need to speak with the account holder.' },
      { speaker: 'ai', text: 'Can you tell me your name and what company you represent?' },
      { speaker: 'caller', text: 'That is private. Just put them on the line.' },
      {
        speaker: 'ai',
        text:
          'Please send an official email from your company domain with the reason for your call. The account holder will review it.',
      },
      { speaker: 'system', text: 'ScamReaper verdict: YELLOW — Unable to verify' },
    ],
  },
  {
    id: '4',
    number: '+1 (888) 999-0011',
    callerName: 'Amazon Rewards',
    claim: 'You won a $1000 Amazon gift card',
    status: 'scam',
    time: 'Yesterday',
    timestamp: Date.now() - 30 * 60 * 60 * 1000,
    verdict:
      'Prize scam. Amazon does not cold call customers about gift cards. Caller requested credit card details "to cover shipping" — a classic social engineering tactic to steal payment info.',
    transcript: [
      { speaker: 'system', text: 'Call auto-answered by iOS Call Screening' },
      { speaker: 'ai', text: 'Hello, who is calling please?' },
      {
        speaker: 'caller',
        text:
          'Congratulations! You have been selected to win a $1000 Amazon gift card. To claim your prize we just need your credit card number to cover the $4.99 shipping fee.',
      },
      {
        speaker: 'ai',
        text: 'Amazon does not request payment details over the phone. Please send an email from an official Amazon domain.',
      },
      { speaker: 'caller', text: 'This offer expires in five minutes, you must act now.' },
      { speaker: 'system', text: 'ScamReaper verdict: RED — Scam detected' },
    ],
  },
  {
    id: '5',
    number: '+1 (415) 333-2200',
    callerName: 'Unknown',
    claim: 'Bank fraud alert on your account',
    status: 'scam',
    time: 'Yesterday',
    timestamp: Date.now() - 32 * 60 * 60 * 1000,
    verdict:
      'Bank impersonation scam. Real banks never ask for your full card number, PIN, or one-time passcodes over the phone. Caller pressured urgency and requested sensitive credentials.',
    transcript: [
      { speaker: 'system', text: 'Call auto-answered by iOS Call Screening' },
      { speaker: 'ai', text: 'Hello, who is calling please?' },
      {
        speaker: 'caller',
        text:
          'This is the fraud department at your bank. We detected suspicious charges on your account. Please confirm your full card number and the six digit code we just texted you.',
      },
      {
        speaker: 'ai',
        text:
          'Legitimate banks never request full card numbers or one-time codes by phone. Please contact the customer through the number on the back of their card.',
      },
      { speaker: 'system', text: 'ScamReaper verdict: RED — Scam detected' },
    ],
  },
  {
    id: '6',
    number: '+1 (650) 444-5500',
    callerName: 'FedEx Delivery',
    claim: 'Package delivery re-schedule',
    status: 'legitimate',
    time: '2 days ago',
    timestamp: Date.now() - 50 * 60 * 60 * 1000,
    verdict:
      'Legitimate delivery follow-up. Caller provided tracking number, did not request payment or personal information, and offered a callback number matching the public FedEx support line.',
    transcript: [
      { speaker: 'system', text: 'Call auto-answered by iOS Call Screening' },
      { speaker: 'ai', text: 'Hello, who is calling please?' },
      {
        speaker: 'caller',
        text:
          "Hi, this is FedEx. We tried to deliver your package with tracking 7749-8812-3345 but no one was home. You can reschedule at fedex.com or call 1-800-GoFedEx.",
      },
      { speaker: 'system', text: 'ScamReaper verdict: GREEN — Legitimate call' },
    ],
  },
];

export function getCallById(id: string): CallEntry | undefined {
  return SAMPLE_CALLS.find((c) => c.id === id);
}
