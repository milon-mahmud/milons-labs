import type { CustomVoicePersona, VoiceProfile } from '../types/studio';

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

export const CHARACTER_VOICE_CATALOG: CustomVoicePersona[] = [
  {
    id: 'char-rimjhim',
    name: 'রিমঝিম (Rimjhim · ৭ বছর)',
    baseVoice: 'Kore',
    styleDirection:
      'Bright, curious, sweet 7-year-old Bengali village girl voice, innocent clear pitch, lively energy and crisp Shuddho Bangla',
    summary: '৭ বছর · ছোট্ট গ্রামের মেয়ে',
    createdAt: 1731600010000,
  },
  {
    id: 'char-tultul',
    name: 'তুলতুল (Tultul · ৭–৮ বছর)',
    baseVoice: 'Zephyr',
    styleDirection:
      'Soft, airy, gentle whisper-like cute 7-year-old floating friendly ghost voice, shy timid breathy cadence and sweet innocent Bengali tone',
    summary: 'দেখতে ৭–৮ বছর · ছোট্ট সাদা ভাসমান ভূত; প্রকৃত বয়স অজানা',
    createdAt: 1731600003000,
  },
  {
    id: 'char-bhulo',
    name: 'ভুলো (Bhulo · ১ বছর)',
    baseVoice: 'Puck',
    styleDirection:
      'Playful, loyal, goofy and excited 1-year-old animated puppy dog character voice, bouncy cheerful energy and cute expressive Bengali delivery',
    summary: '১ বছর · ছোট্ট পোষা কুকুর',
    createdAt: 1731600011000,
  },
  {
    id: 'char-bappa',
    name: 'বাপ্পা (Bappa · ৮ বছর)',
    baseVoice: 'Puck',
    styleDirection:
      'Bright, friendly, sincere 8-year-old Bengali village boy voice, lively youthful pitch, warm adventurous spirit and clear Bangla',
    summary: '৮ বছর · রিমঝিমের বন্ধু',
    createdAt: 1731600012000,
  },
  {
    id: 'char-thammi',
    name: 'ঠাম্মি (Thammi · ৬৫ বছর)',
    baseVoice: 'Zephyr',
    styleDirection:
      'Warm, wise, deeply affectionate 65-year-old Bengali grandmother voice, calm unhurried storytelling cadence and loving maternal warmth',
    summary: '৬৫ বছর · জ্ঞানী ও স্নেহময়ী বৃদ্ধা',
    createdAt: 1731600013000,
  },
  {
    id: 'char-dr-rahman',
    name: 'ড. রহমান (Dr. Rahman · ৩৮ বছর)',
    baseVoice: 'Charon',
    styleDirection:
      'Calm, articulate, intelligent 38-year-old Bengali scientist and mentor voice, reassuring clarity, steady thoughtful pacing and refined Bangla',
    summary: '৩৮ বছর · বিজ্ঞানী ও পথপ্রদর্শক',
    createdAt: 1731600014000,
  },
  {
    id: 'char-ranger-karim',
    name: 'রেঞ্জার করিম (Ranger Karim · ৩৫ বছর)',
    baseVoice: 'Fenrir',
    styleDirection:
      'Strong, warm-hearted, grounded 35-year-old nature and forest ranger male voice, confident outdoor vitality and natural conversational Bangla',
    summary: '৩৫ বছর · প্রকৃতির বন্ধু',
    createdAt: 1731600015000,
  },
  {
    id: 'char-piklu',
    name: 'পিকলু (Piklu · ৮ বছর)',
    baseVoice: 'Puck',
    styleDirection:
      'Cheeky, mischievous, fast-talking energetic 8-year-old boy voice, playful teasing tone, expressive youthful bursts and crisp Bangla',
    summary: '৮ বছর · দুষ্টু ও চঞ্চল ছেলে',
    createdAt: 1731600016000,
  },
  {
    id: 'char-narrator',
    name: 'ন্যারেটর (গল্পকথক)',
    baseVoice: 'Kore',
    styleDirection:
      'Warm, expressive female Bengali storyteller, Shuddho Bangla pronunciation, smooth emotional rhythm and gentle pauses',
    summary: 'মূল গল্পকথক · মহিলা, উষ্ণ ও আবেগপূর্ণ গল্পবলার কণ্ঠ',
    createdAt: 1731600001000,
  },
  {
    id: 'char-dadu',
    name: 'দাদু (৬৫ বছর)',
    baseVoice: 'Charon',
    styleDirection:
      'Warm, wise 65-year-old Bengali grandfather voice, calm unhurried elderly cadence, affectionate depth and gentle authority',
    summary: '৬৫ বছর · স্নেহশীল ও প্রবীণ রিমঝিমের দাদু',
    createdAt: 1731600004000,
  },
  {
    id: 'char-rahim',
    name: 'দোকানদার কাকা রহিম (৪০ বছর)',
    baseVoice: 'Fenrir',
    styleDirection:
      'Deep, hearty 40-year-old Bangladeshi village shopkeeper male voice, warm friendly chest resonance and natural conversational Bangla',
    summary: '৪০ বছর · গ্রামের দোকানদার',
    createdAt: 1731600005000,
  },
  {
    id: 'char-mithu',
    name: 'মিঠু (বিড়ালছানা · ৩ মাস)',
    baseVoice: 'Zephyr',
    styleDirection:
      'Tiny, playful, super-cute 3-month-old animated kitten character voice, soft high-pitched chirps and sweet innocent Bengali delivery',
    summary: '৩ মাস · কমলা-সাদা আদরের বিড়ালছানা',
    createdAt: 1731600006000,
  },
  {
    id: 'char-mother',
    name: 'মা (মমতাময়ী মা · ৩৪ বছর)',
    baseVoice: 'Kore',
    styleDirection:
      'Tender, loving, soothing 34-year-old Bengali mother voice, gentle maternal warmth, reassuring smile and crisp Bangla',
    summary: '৩৪ বছর · স্নেহময়ী মা',
    createdAt: 1731600017000,
  },
  {
    id: 'char-mystery',
    name: 'রহস্যময় প্রহরী (Mystery)',
    baseVoice: 'Charon',
    styleDirection:
      'Deep, hushed, mysterious guardian voice with slow suspenseful pauses and atmospheric cinematic gravity',
    summary: 'অজানা · রহস্য, রোমাঞ্চ ও সাসপেন্সের কণ্ঠ',
    createdAt: 1731600018000,
  },
  {
    id: 'char-villain',
    name: 'গম্ভীর খল চরিত্র (Antagonist)',
    baseVoice: 'Fenrir',
    styleDirection:
      'Bold, gravelly, dramatic antagonist male voice, sharp intense articulation and commanding theatrical presence',
    summary: '৪৫ বছর · গল্পের গম্ভীর বা দুষ্টু খল চরিত্র',
    createdAt: 1731600019000,
  },
];

export const STORY_CHARACTER_PERSONAS: CustomVoicePersona[] = CHARACTER_VOICE_CATALOG.slice(0, 8);

export const RIMI_TULTUL_STORY_PRESET = {
  speakers: [
    {
      name: 'ন্যারেটর',
      voiceName: 'Kore' as const,
      style:
        'Warm, expressive female Bengali storyteller, Shuddho Bangla pronunciation, smooth emotional rhythm and gentle pauses',
    },
    {
      name: 'রিমঝিম',
      voiceName: 'Kore' as const,
      style:
        'Bright, curious, sweet 7-year-old Bengali village girl voice, innocent clear pitch, lively energy and crisp Shuddho Bangla',
    },
    {
      name: 'তুলতুল',
      voiceName: 'Zephyr' as const,
      style:
        'Soft, airy, gentle whisper-like cute 7-year-old floating friendly ghost voice, shy timid breathy cadence and sweet innocent Bengali tone',
    },
    {
      name: 'ভুলো',
      voiceName: 'Puck' as const,
      style:
        'Playful, loyal, goofy and excited 1-year-old animated puppy dog character voice, bouncy cheerful energy and cute expressive Bengali delivery',
    },
    {
      name: 'বাপ্পা',
      voiceName: 'Puck' as const,
      style:
        'Bright, friendly, sincere 8-year-old Bengali village boy voice, lively youthful pitch, warm adventurous spirit and clear Bangla',
    },
    {
      name: 'ঠাম্মি',
      voiceName: 'Zephyr' as const,
      style:
        'Warm, wise, deeply affectionate 65-year-old Bengali grandmother voice, calm unhurried storytelling cadence and loving maternal warmth',
    },
    {
      name: 'ড. রহমান',
      voiceName: 'Charon' as const,
      style:
        'Calm, articulate, intelligent 38-year-old Bengali scientist and mentor voice, reassuring clarity, steady thoughtful pacing and refined Bangla',
    },
    {
      name: 'রেঞ্জার করিম',
      voiceName: 'Fenrir' as const,
      style:
        'Strong, warm-hearted, grounded 35-year-old nature and forest ranger male voice, confident outdoor vitality and natural conversational Bangla',
    },
    {
      name: 'পিকলু',
      voiceName: 'Puck' as const,
      style:
        'Cheeky, mischievous, fast-talking energetic 8-year-old boy voice, playful teasing tone, expressive youthful bursts and crisp Bangla',
    },
    {
      name: 'দোকানদার কাকা রহিম',
      voiceName: 'Fenrir' as const,
      style:
        'Deep, hearty 40-year-old Bangladeshi village shopkeeper male voice, warm friendly chest resonance and natural conversational Bangla',
    },
  ],
  rawScript: `[দৃশ্য ১]
[ন্যারেটর]:
[curious] রিমঝিম চিৎকার করল না।
[softly] সে শুধু চোখ বড় বড় করে তাকিয়ে রইল, তারপর জিজ্ঞেস করল,

[রিমঝিম]:
[curious] তুমিই কি সেদিন ঘুড়িটা এনেছিলে?

[ন্যারেটর]:
[warmly] তুলতুল মাথা নাড়ল, আর এই প্রথম কেউ তাকে সামনাসামনি কিছু জিজ্ঞেস করেছে।

[তুলতুল]:
[shy] আমি শুধু... তোমাদের সঙ্গে খেলতে চেয়েছিলাম, বুঝলে?

[ন্যারেটর]:
[relieved] তুলতুলের আলোয় বাঁশঝাড়ের ভেতরটা পরিষ্কার দেখা গেল।
[cheerful] ভুলো তখন খুশিতে লেজ নাড়তে নাড়তে ছুটে এল।
[warmly] রিমঝিম হাত বাড়িয়ে দিয়ে বলল,

[রিমঝিম]:
[cheerful] আমার নাম রিমঝিম। তোমার?

[তুলতুল]:
[happy] তুলতুল।`,
};

