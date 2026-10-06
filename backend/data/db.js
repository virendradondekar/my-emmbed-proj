/**
 * db.js — Simple JSON file-based database
 * All data lives in db.json in this folder.
 * No external DB needed to run locally.
 */
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'db.json');

// ── Default seed data ──
function defaultData() {
  const aid1 = uuidv4();
  const aid2 = uuidv4();
  const today = new Date();
  const d = (n) => { const x = new Date(today); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };

  return {
    accounts: [
      { id: aid1, name: 'Personal', email: 'personal@gmail.com', color: '#4F8EF7' },
      { id: aid2, name: 'Work',     email: 'work@company.com',   color: '#9B72F5' }
    ],
    items: [
      { id: uuidv4(), acctId: aid1, name: 'Figma',          category: 'Design',          plan: 'Professional', cost: '800',   currency: '₹ INR', cycle: 'monthly',  start: d(-60),  expiry: d(5),   notes: 'Design tool',       key: '',           seats: '5', url: 'https://figma.com',    isDraft: false, createdAt: new Date().toISOString() },
      { id: uuidv4(), acctId: aid1, name: 'AWS EC2',         category: 'Infrastructure', plan: 'On-demand',    cost: '3200',  currency: '₹ INR', cycle: 'monthly',  start: d(-30),  expiry: d(22),  notes: 'us-east-1',         key: '',           seats: '1', url: '',                     isDraft: false, createdAt: new Date().toISOString() },
      { id: uuidv4(), acctId: aid1, name: 'Slack',           category: 'SaaS',           plan: 'Pro',          cost: '1200',  currency: '₹ INR', cycle: 'monthly',  start: d(-90),  expiry: d(45),  notes: 'Team comms',        key: '',           seats: '10',url: '',                     isDraft: false, createdAt: new Date().toISOString() },
      { id: uuidv4(), acctId: aid1, name: 'yourdomain.com',  category: 'Domain',         plan: 'Annual',       cost: '1500',  currency: '₹ INR', cycle: 'annual',   start: d(-200), expiry: d(165), notes: 'GoDaddy',           key: '',           seats: '1', url: '',                     isDraft: false, createdAt: new Date().toISOString() },
      { id: uuidv4(), acctId: aid1, name: 'MacBook Pro M3',  category: 'Hardware',       plan: 'AppleCare+',   cost: '24000', currency: '₹ INR', cycle: 'annual',   start: d(-400), expiry: d(-3),  notes: 'SN: XYZ123',        key: 'XYZ123',     seats: '1', url: '',                     isDraft: false, createdAt: new Date().toISOString() },
      { id: uuidv4(), acctId: aid2, name: 'Vercel Pro',      category: 'Infrastructure', plan: 'Pro',          cost: '1700',  currency: '₹ INR', cycle: 'monthly',  start: d(-15),  expiry: d(15),  notes: 'Frontend deploy',   key: '',           seats: '1', url: 'https://vercel.com',   isDraft: false, createdAt: new Date().toISOString() },
      { id: uuidv4(), acctId: aid2, name: 'Linear',          category: 'SaaS',           plan: 'Business',     cost: '600',   currency: '₹ INR', cycle: 'monthly',  start: d(-10),  expiry: d(90),  notes: 'PM tool',           key: '',           seats: '3', url: '',                     isDraft: false, createdAt: new Date().toISOString() },
      { id: uuidv4(), acctId: aid2, name: 'Adobe CC',        category: 'License',        plan: 'All Apps',     cost: '4800',  currency: '₹ INR', cycle: 'annual',   start: d(-300), expiry: d(210), notes: '1 seat',            key: 'ADOBE-XXXX', seats: '1', url: '',                     isDraft: false, createdAt: new Date().toISOString() },
      { id: uuidv4(), acctId: aid2, name: 'Notion Team',     category: 'SaaS',           plan: 'Team',         cost: '900',   currency: '₹ INR', cycle: 'monthly',  start: d(-50),  expiry: d(10),  notes: 'Docs & wiki',       key: '',           seats: '5', url: '',                     isDraft: false, createdAt: new Date().toISOString() }
    ],
    settings: {
      name: 'You',
      email: 'me@example.com',
      bio: '',
      color: '#4F8EF7',
      showExpiredBanner: true,
      compact: false,
      annualView: true,
      vsBannerDismissed: false
    },
    vsIntegration: {
      enabled: false,
      connectedAccts: {}
    },
    invoices: [],
    slackIntegration: { enabled: false, authId: null, scriptId: null, destinationType: null, destinationId: null, destinationLabel: null },
    activity: [
      { id: uuidv4(), text: 'SubTrack Pro initialized', ico: '✅', color: 'var(--grn-bg)', ts: Date.now() }
    ],
    notifications: [
      { id: uuidv4(), title: 'Figma Pro expiring soon',    desc: '5 days left — renew to avoid interruption', ico: '🎨', color: '#EC4899', unread: true, ts: Date.now() - 3600000 },
      { id: uuidv4(), title: 'MacBook AppleCare expired',  desc: 'Warranty expired 3 days ago',                ico: '💻', color: '#26D07C', unread: true, ts: Date.now() - 86400000 },
      { id: uuidv4(), title: 'Notion Team — 10 days left', desc: 'Renewal due soon',                          ico: '☁️', color: '#4F8EF7', unread: true, ts: Date.now() - 43200000 }
    ]
  };
}

// ── Load or init ──
function load() {
  if (!fs.existsSync(DB_PATH)) {
    const data = defaultData();
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), { mode: 0o600 });
    return data;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (e) {
    console.error('DB read error, resetting:', e.message);
    const data = defaultData();
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), { mode: 0o600 });
    return data;
  }
}

const _db = load();

// Migrate installations created before direct Gmail connections were added.
_db.settings ||= {};
_db.vsIntegration ||= { enabled: false, connectedAccts: {} };
_db.vsIntegration.connectedAccts ||= {};
_db.invoices ||= [];
_db.slackIntegration ||= { enabled: false, authId: null, scriptId: null, destinationType: null, destinationId: null, destinationLabel: null };

// Attach save method
_db.save = function () {
  const { save, ...data } = this;
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), { mode: 0o600 });
  try { fs.chmodSync(DB_PATH, 0o600); } catch (_) { /* keep the database usable on filesystems without POSIX modes */ }
};

module.exports = _db;
