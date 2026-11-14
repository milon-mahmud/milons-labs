import type { VoiceProfile } from '../types/studio';

export const STUDIO_VOICES: VoiceProfile[] = [
  {
    id: 'Kore',
    name: 'Kore',
    tone: 'Clear · Balanced · Studio',
    gender: 'Female',
    bestFor: 'Explainers, YouTube narration, multilingual reads',
    samplePrompt: 'Clear, natural studio narrator with crisp pacing',
  },
  {
    id: 'Puck',
    name: 'Puck',
    tone: 'Bright · Energetic · Expressive',
    gender: 'Male',
    bestFor: 'Creator videos, promos, dynamic storytelling',
    samplePrompt: 'Enthusiastic, engaging creator voice with lively inflection',
  },
  {
    id: 'Charon',
    name: 'Charon',
    tone: 'Deep · Grounded · Authoritative',
    gender: 'Male',
    bestFor: 'Documentaries, news briefings, dramatic trailers',
    samplePrompt: 'Deep, authoritative documentary narrator with measured pauses',
  },
  {
    id: 'Fenrir',
    name: 'Fenrir',
    tone: 'Bold · Textured · Resonant',
    gender: 'Male',
    bestFor: 'Audiobooks, thriller stories, cinematic voiceovers',
    samplePrompt: 'Warm, resonant voice with dramatic gravity and steady cadence',
  },
  {
    id: 'Zephyr',
    name: 'Zephyr',
    tone: 'Soft · Conversational · Calm',
    gender: 'Female',
    bestFor: 'Podcasts, meditation, conversational assistants',
    samplePrompt: 'Gentle, conversational voice with warm intimacy',
  },
];

export const STYLE_PRESETS = [
  {
    label: 'Bangla Storyteller',
    style: 'Warm, emotional Bengali storyteller with expressive pauses and natural rhythm',
  },
  {
    label: 'Bangla News',
    style: 'Clear, authoritative Bengali broadcast anchor with crisp articulation',
  },
  {
    label: 'YouTube Creator',
    style: 'Energetic, conversational YouTube creator with lively emphasis and natural pacing',
  },
  {
    label: 'Documentary',
    style: 'Deep, reflective documentary narrator with deliberate pauses and cinematic clarity',
  },
  {
    label: 'Commercial Promo',
    style: 'Confident, upbeat commercial voiceover with punchy phrasing',
  },
  {
    label: 'Calm & Intimate',
    style: 'Soft, unhurried, soothing delivery close to the microphone',
  },
];

export const SAMPLE_SCRIPTS = {
  english:
    'Welcome to the future of independent audio production. <breath> With just a single script, you can craft studio-grade narration, shape emotional delivery, and export clean subtitles in seconds.',
  bangla:
    'স্বাগতম আমাদের অডিও স্টুডিওতে। <breath> এখন কোনো খরচ ছাড়াই আপনি যেকোনো অডিও থেকে নির্ভুল বাংলা বা ইংরেজি সাবটাইটেল তৈরি করতে পারবেন, এবং প্রফেশনাল ভয়েসওভার জেনারেট করতে পারবেন মুহূর্তেই।',
  podcastA: 'Welcome back everyone! <breath> Today we are testing how natural AI voices sound in real conversations.',
  podcastB: 'Honestly, |yeah| the pacing and subtle breaths make it feel just like a live studio recording. <laugh>',
  banglaPodcastA: 'স্বাগতম সবাইকে আজকের পডকাস্টে! <breath> আজ আমরা দেখব বাংলা কথোপকথনে এআই ভয়েস কতটা ন্যাচারাল শোনায়।',
  banglaPodcastB: 'একদম ঠিক বলেছ, |yeah| কথা বলার মাঝে হালকা বিরতি আর আবেগ থাকলে একদম স্টুডিও রেকর্ডিংয়ের মতো মনে হয়। <laugh>',
};

export const VOCAL_TAGS = [
  { tag: '<breath>', label: 'Breath' },
  { tag: '<laugh>', label: 'Laugh' },
  { tag: '<gasp>', label: 'Gasp' },
  { tag: '|mhm|', label: 'Mhm' },
  { tag: '|yeah|', label: 'Yeah' },
];

export const VOICE_SHIFT_PRESETS: Array<{
  label: string;
  voiceName: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';
  style: string;
}> = [
  {
    label: 'Natural Narrator (Female)',
    voiceName: 'Kore',
    style: 'Warm, expressive storyteller with smooth conversational rhythm',
  },
  {
    label: 'Soft & Gentle (Female)',
    voiceName: 'Zephyr',
    style: 'Soft, intimate, soothing female voice with gentle emotion',
  },
  {
    label: 'Youthful & Energetic (Male)',
    voiceName: 'Puck',
    style: 'Bright, enthusiastic young male voice with lively inflection',
  },
  {
    label: 'Deep & Dramatic (Male)',
    voiceName: 'Charon',
    style: 'Deep, grounded, cinematic male voice with deliberate gravity',
  },
  {
    label: 'Bold Character (Male)',
    voiceName: 'Fenrir',
    style: 'Textured, intense, gravelly dramatic male character',
  },
  {
    label: 'Suspenseful Whisper',
    voiceName: 'Zephyr',
    style: 'Hushed, close-mic suspenseful whisper with tense breathing',
  },
  {
    label: 'Elderly & Wise',
    voiceName: 'Charon',
    style: 'Slow, warm, wise elderly voice with thoughtful pauses',
  },
  {
    label: 'Excited & Cheerful',
    voiceName: 'Puck',
    style: 'Happy, smiling, excited delivery full of warmth',
  },
  {
    label: 'Emotional / Touching',
    voiceName: 'Kore',
    style: 'Deeply emotional, tender, heartfelt delivery with soft pauses',
  },
];

export const BANGLA_VOICE_SHIFT_DEMO = [
  {
    presetLabel: 'Natural Narrator (Female)',
    voiceName: 'Kore' as const,
    style: 'Warm, expressive storyteller with smooth conversational rhythm',
    text: 'রাত তখন প্রায় বারোটা। <breath> হঠাৎ জানালার বাইরে হালকা বাতাসের শব্দে মনটা কেমন যেন চমকে উঠল।',
  },
  {
    presetLabel: 'Suspenseful Whisper',
    voiceName: 'Zephyr' as const,
    style: 'Hushed, close-mic suspenseful whisper with tense breathing',
    text: 'কে ওখানে? <breath> কেউ কি বাইরে দাঁড়িয়ে আছেন?',
  },
  {
    presetLabel: 'Excited & Cheerful',
    voiceName: 'Puck' as const,
    style: 'Happy, smiling, excited delivery full of warmth',
    text: 'আরে ভয় পেয়ো না! <laugh> আমি তো তোমার পুরোনো বন্ধু রাফি, সারপ্রাইজ দিতে এসেছি!',
  },
  {
    presetLabel: 'Deep & Dramatic (Male)',
    voiceName: 'Charon' as const,
    style: 'Deep, grounded, cinematic male voice with deliberate gravity',
    text: 'আর সেদিনই বুঝেছিলাম, প্রকৃত বন্ধুত্ব কোনো সময় বা দূরত্ব মানে না।',
  },
];

export const RIMI_TULTUL_STORY_PRESET = {
  speakers: [
    {
      name: 'ন্যারেটর',
      voiceName: 'Kore' as const,
      style:
        'Warm, expressive female Bengali storyteller, Shuddho Bangla pronunciation, smooth emotional rhythm',
    },
    {
      name: 'রিমি',
      voiceName: 'Zephyr' as const,
      style:
        'Sweet, innocent 7-year-old Bengali girl voice, bright youthful pitch, lively clear Bangla diction',
    },
    {
      name: 'তুলতুল',
      voiceName: 'Zephyr' as const,
      style:
        'Soft, airy, gentle whisper-like cute child voice, shy and sweet Bengali tone with delicate pauses',
    },
    {
      name: 'দোকানদার কাকা রহিম',
      voiceName: 'Fenrir' as const,
      style:
        'Deep, friendly 40-year-old Bangladeshi village shopkeeper male voice, warm conversational Bangla',
    },
    {
      name: 'দাদু',
      voiceName: 'Charon' as const,
      style:
        'Warm, wise 65-year-old Bengali grandfather voice, calm unhurried elderly cadence, affectionate depth',
    },
  ],
  rawScript: `[দৃশ্য ১]
[ন্যারেটর]:
[curious] রিমি চিৎকার করল না।
[softly] সে শুধু চোখ বড় বড় করে তাকিয়ে রইল, তারপর জিজ্ঞেস করল,

[রিমি]:
[curious] তুমিই কি সেদিন ঘুড়িটা এনেছিলে?

[ন্যারেটর]:
[warmly] তুলতুল মাথা নাড়ল, আর এই প্রথম কেউ তাকে সামনাসামনি কিছু জিজ্ঞেস করেছে।

[তুলতুল]:
[shy] আমি শুধু... তোমাদের সঙ্গে খেলতে চেয়েছিলাম, বুঝলে?

[ন্যারেটর]:
[relieved] তুলতুলের আলোয় বাঁশঝাড়ের ভেতরটা পরিষ্কার দেখা গেল।
[cheerful] মিঠু একটা শুকনো ডালের ফাঁকে আটকে বসে ছিল।
[warmly] রিমি ওকে বুকে তুলে নিল, তারপর হাত বাড়িয়ে দিয়ে বলল,

[রিমি]:
[cheerful] আমার নাম রিমি। তোমার?

[তুলতুল]:
[happy] তুলতুল।`,
};

