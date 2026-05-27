/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Mic, 
  MicOff, 
  BookOpen, 
  Sparkles, 
  ArrowRight, 
  RefreshCcw, 
  Volume2, 
  CheckCircle2, 
  Star, 
  Cloud, 
  Sun, 
  Heart, 
  Camera, 
  Download,
  Music
} from 'lucide-react';
import { 
  StoryState, 
  generateBuklikResponse, 
  generateStoryParagraph, 
  speakText, 
  generateStoryImage, 
  evaluateReading,
  detectGender,
  transcribeAudio,
  generateStoryBranches
} from './services/geminiService';

import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

type GameStage = 'WELCOME' | 'NAME' | 'GENDER' | 'HERO' | 'LOCATION' | 'FRIEND' | 'STORY_TIME' | 'CHOOSE_NEXT' | 'COMPLETION';
type BuklikEmotion = 'idle' | 'thinking' | 'happy' | 'listening' | 'excited';

export interface StoryElement {
  paragraph: string;
  imageUrl: string | null;
}

const API_KEY = process.env.GEMINI_API_KEY || process.env.USER_API_KEY || '';
const hasValidKey = Boolean(API_KEY) && API_KEY !== 'MY_GEMINI_API_KEY';

function BuklikAvatar({ emotion, isProcessing, stage }: { emotion: BuklikEmotion, isProcessing: boolean, stage: GameStage }) {
  const getAnimation = () => {
    if (isProcessing) return { scale: [1, 1.05, 1], rotate: [0, 2, -2, 0] };
    if (stage === 'COMPLETION') {
      return { y: [0, -30, 0], scale: [1, 1.08, 1], rotate: [0, 3, -3, 0] };
    }
    switch (emotion) {
      case 'happy': return { y: [0, -15, 0], scale: [1, 1.1, 1], rotate: [0, 2, -2, 0] };
      case 'excited': return { scale: [1, 1.25, 1], rotate: [0, 8, -8, 0] };
      case 'listening': return { scale: [1, 0.95, 1], rotate: [0, 1, -1, 0] };
      case 'thinking': return { rotate: [0, 5, -5, 0], y: [0, -5, 0] };
      default: return { y: [0, -8, 0] };
    }
  };

  const getBuklikImage = () => {
    if (stage === 'COMPLETION') return "/buklik_jump.mp4"; // Jump for completion
    if (emotion === 'excited') return "/buklik_clap.mp4"; // Clap for success
    return "/moy_buklik.jpg";
  };

  const getBuklikMedia = () => {
    const src = getBuklikImage();
    const isVideo = src.toLowerCase().endsWith('.mp4');
    const borderRadiusClass = stage === 'COMPLETION' ? 'rounded-[90px] md:rounded-[120px]' : 'rounded-[40px] md:rounded-[70px]';
    
    if (isVideo) {
      return (
        <video 
          key={src}
          src={src} 
          autoPlay={true} 
          loop={true} 
          muted={true} 
          playsInline={true} 
          className={`w-full h-full object-cover ${borderRadiusClass}`}
          onError={(e) => {
            console.warn("Video animation failed, falling back to static image", src);
            const video = e.target as HTMLVideoElement;
            const parent = video.parentElement;
            if (parent) {
              video.style.display = 'none';
              // Check if image is already present in parent
              let img = parent.querySelector('.fallback-img') as HTMLImageElement;
              if (!img) {
                img = document.createElement('img');
                img.className = `fallback-img w-full h-full object-cover ${borderRadiusClass}`;
                parent.appendChild(img);
              }
              img.src = "/moy_buklik.jpg";
              img.style.display = 'block';
            }
          }}
        />
      );
    }

    return (
      <img 
        src={src} 
        alt="Buklik" 
        className={`w-full h-full object-cover ${borderRadiusClass}`} 
        onError={(e) => {
          const img = e.target as HTMLImageElement;
          // Only hide if it's the main image that failed
          if (img.src.includes("/moy_buklik.jpg")) {
            img.style.display = 'none';
            const fallback = img.parentElement?.querySelector('.fallback-icon');
            if (fallback) fallback.classList.remove('hidden');
          } else {
            // If animation fails, fallback to static Buklik
            img.src = "/moy_buklik.jpg";
          }
        }} 
      />
    );
  };

  const containerSizeClass = stage === 'COMPLETION'
    ? "w-64 h-64 md:w-[420px] md:h-[420px] bg-white/60 p-3 rounded-[100px] md:rounded-[130px] border-8 md:border-[12px] border-white shadow-[0_30px_80px_rgba(255,180,0,0.3)] relative overflow-hidden flex items-center justify-center backdrop-blur-sm"
    : "w-40 h-40 md:w-56 md:h-56 bg-white/60 p-2 rounded-[50px] md:rounded-[80px] border-4 md:border-8 border-white shadow-[0_20px_50px_rgba(0,0,0,0.2)] relative overflow-hidden flex items-center justify-center backdrop-blur-sm";

  return (
    <motion.div 
      animate={getAnimation()} 
      transition={{ duration: isProcessing ? 1.5 : 3.5, repeat: Infinity, ease: "easeInOut" }}
      className="relative inline-block z-10"
    >
      <div className={containerSizeClass}>
        {getBuklikMedia()}
        <div className="fallback-icon hidden flex flex-col items-center text-[#5A5A40] p-4 text-center">
          <BookOpen className="w-16 h-16 md:w-28 lg:w-40" />
          <p className="font-black text-[10px] md:text-xs mt-2 uppercase">Твой Буклик</p>
        </div>
        
        {emotion === 'happy' && stage !== 'COMPLETION' && (
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute top-4 right-4 text-red-500 drop-shadow-lg">
            <Heart fill="currentColor" size={30} className="md:w-10 md:h-10" />
          </motion.div>
        )}
        {emotion === 'excited' && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-yellow-400/20" />}
      </div>
      
      {stage !== 'COMPLETION' && (
        <motion.div 
          animate={{ rotate: 360, scale: [1, 1.2, 1] }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          className="absolute -top-6 -right-6 md:-top-10 md:-right-10 text-yellow-400 opacity-80"
        >
          <Sparkles className="w-12 h-12 md:w-20 md:h-20" />
        </motion.div>
      )}

      {isProcessing && (
        <motion.div 
          animate={{ scale: [1, 1.6, 1], opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 0.8, repeat: Infinity }}
          className="absolute -bottom-6 -left-6 bg-white rounded-full p-4 shadow-2xl"
        >
          <Sparkles size={40} className="text-yellow-500" />
        </motion.div>
      )}
    </motion.div>
  );
}

export default function App() {
  const [stage, setStage] = useState<GameStage>('WELCOME');
  const [emotion, setEmotion] = useState<BuklikEmotion>('idle');
  
  const [storyState, setStoryState] = useState<StoryState>({
    childName: '',
    gender: 'unknown',
    heroName: '',
    heroType: '',
    friendName: '',
    location: '',
    paragraphs: [],
    currentParagraphIndex: 0,
  });

  const [theme, setTheme] = useState({
    bg: 'linear-gradient(to bottom right, #7BC5AE, #B8E1D9, #E6C5A8)',
    accent: '#FFB27F',
    paper: '#FFF9E6',
    border: '#FFB27F'
  });

  const THEMES = [
    { bg: 'linear-gradient(to bottom right, #7BC5AE, #B8E1D9, #E6C5A8)', accent: '#FFB27F', paper: '#FFF9E6', border: '#FFB27F' }, // Original
    { bg: 'linear-gradient(to bottom right, #A8D8EA, #AA96DA, #FCBAD3)', accent: '#AA96DA', paper: '#F5F3FF', border: '#AA96DA' }, // Soft Purple/Blue
    { bg: 'linear-gradient(to bottom right, #DEE1B6, #B4D6C1, #8FC1B5)', accent: '#8FC1B5', paper: '#F1F8E9', border: '#8FC1B5' }, // Greenish
    { bg: 'linear-gradient(to bottom right, #FFDEE9, #B5FFFC, #74EBD5)', accent: '#74EBD5', paper: '#E0F7FA', border: '#74EBD5' }, // Bright Blue/Pink
  ];

  const setRandomTheme = () => {
    const randomTheme = THEMES[Math.floor(Math.random() * THEMES.length)];
    setTheme(randomTheme);
  };
  const [buklikText, setBuklikText] = useState('Привет! Давай знакомиться. Как тебя зовут?');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGeneratingStory, setIsGeneratingStory] = useState(false);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [isReadingCorrectly, setIsReadingCorrectly] = useState<boolean | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [inputText, setInputText] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [nextStoryIdeas, setNextStoryIdeas] = useState<string[]>([]);
  const [history, setHistory] = useState<StoryElement[]>([]);

  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'ru-RU';
      
      recognition.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        handleStep(text);
      };

      recognition.onerror = (event: any) => {
        console.error("Speech Recognition Error:", event.error);
        setIsRecording(false);
        setEmotion('idle');
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (buklikText && voiceEnabled) {
      // Don't auto-speak long story paragraphs unless specifically requested to avoid overwhelming 
      // but do auto-speak Buklik's instructions
      if (stage !== 'STORY_TIME') {
        handleSpeak(buklikText);
      }
    }
  }, [buklikText, voiceEnabled, stage]);

  const handleSpeak = (text: string) => {
    if (!voiceEnabled || !text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ru-RU';
    utterance.rate = 1.0;
    utterance.pitch = 1.2;

    const setVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      const ruVoice = voices.find(v => v.lang.includes('ru') && (v.name.includes('Google') || v.name.includes('Female') || v.name.includes('Irina') || v.name.includes('Milena')));
      if (ruVoice) utterance.voice = ruVoice;
      window.speechSynthesis.speak(utterance);
    };

    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = setVoice;
    } else {
      setVoice();
    }
  };

  const startRecording = async () => {
    window.speechSynthesis.cancel();
    // Use SpeechRecognition for intro steps
    if (stage !== 'STORY_TIME' && recognitionRef.current) {
      try {
        recognitionRef.current.start();
        setIsRecording(true);
        setEmotion('listening');
      } catch (e) {
        console.error("Recognition start error", e);
      }
      return;
    }

    // Use MediaRecorder for story reading evaluation (Gemini multimodal)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      setEmotion('listening');
      mediaRecorder.ondataavailable = (e) => e.data.size > 0 && audioChunksRef.current.push(e.data);
      mediaRecorder.onstop = async () => {
        if (audioChunksRef.current.length === 0) return;
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        if (audioBlob.size < 5000) {
           setBuklikText(`${storyState.childName}, кажется, ты ничего не сказал! Нажми подольше и прочти текст вслух.`);
           return;
        }
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(',')[1];
          processReading(base64, mimeType);
        };
      };
      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      setBuklikText("Ой, я не могу включить микрофон! Разреши доступ в настройках браузера.");
    }
  };

  const stopRecording = () => {
    if (stage !== 'STORY_TIME' && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
      return;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setEmotion('thinking');
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const handleStep = async (value: string) => {
    if (!value.trim()) return;
    setInputText('');
    setEmotion('happy');

    switch (stage) {
      case 'NAME':
        setStoryState(prev => ({ ...prev, childName: value }));
        setIsProcessing(true);
        const gender = await detectGender(value);
        setIsProcessing(false);
        if (gender === 'unknown') {
          setStage('GENDER');
          setBuklikText(`Приятно познакомиться, ${value}! Какое замечательное имя. А ты мальчик или девочка?`);
          setSuggestions(['Мальчик', 'Девочка']);
        } else {
          setStoryState(prev => ({ ...prev, gender: gender as 'boy' | 'girl' }));
          setStage('HERO');
          setBuklikText(`Какое красивое имя — ${value}! Я сразу понял, что ты ${gender === 'boy' ? 'смелый мальчик' : 'прекрасная девочка'}. Давай начнем наше приключение! Кто будет главным героем нашей сказки?`);
          setSuggestions(['Фея', 'Дракон', 'Принцесса', 'Котенок', 'Волшебник', 'Робот']);
        }
        break;

      case 'GENDER':
        const g = value.toLowerCase().includes('девочка') || value.toLowerCase().includes('girl') ? 'girl' : 'boy';
        setStoryState(prev => ({ ...prev, gender: g }));
        setStage('HERO');
        setBuklikText(`Здорово! Теперь я всё знаю. Скажи мне, кто будет главным героем нашей сказки? Ты можешь выбрать из списка или придумать своего!`);
        setSuggestions(['Фея', 'Дракон', 'Принцесса', 'Котенок', 'Волшебник', 'Робот']);
        break;

      case 'HERO':
        if (value.toLowerCase() === 'я' || value.toLowerCase().includes('я сам') || value.toLowerCase().includes('я сама')) {
          const heroName = `${storyState.gender === 'boy' ? 'мальчик' : 'девочка'} ${storyState.childName}`;
          setStoryState(prev => ({ ...prev, heroType: 'Человек', heroName }));
        } else {
          setStoryState(prev => ({ ...prev, heroType: value, heroName: value }));
        }
        setStage('LOCATION');
        setBuklikText(`Ого! ${value} — какой отличный выбор! А где будет происходить действие сказки?`);
        setSuggestions(['Волшебный лес', 'Старый замок', 'Космос', 'Остров сокровищ', 'Подводное царство', 'Облачный город']);
        break;

      case 'LOCATION':
        setStoryState(prev => ({ ...prev, location: value }));
        setStage('FRIEND');
        setBuklikText(`О! ${value} — это чудесное место! А кто будет верным другом героя?`);
        setSuggestions(['Верный пёс', 'Говорящий кот', 'Маленький дракон', 'Мудрая сова', 'Веселый робот', 'Волшебная фея']);
        break;

      case 'FRIEND':
        const updatedState = { ...storyState, friendName: value };
        setStoryState(updatedState);
        setBuklikText(`Здорово! ${value} — прекрасный выбор! Сейчас я сочиню самое волшебное начало нашей сказки... ✨`);
        setStage('STORY_TIME');
        startStoryGeneration(updatedState);
        break;
      
      case 'CHOOSE_NEXT':
        nextParagraph(value);
        break;
    }
  };

  const goToHeroStep = () => {
    setStage('HERO');
    setBuklikText("Кто будет главным героем сказки? Выбери или придумай своего!");
    setSuggestions(['Фея', 'Дракон', 'Принцесса', 'Котенок', 'Волшебник', 'Робот']);
  };

  const startStoryGeneration = async (currentState?: StoryState) => {
    setIsGeneratingStory(true);
    setEmotion('thinking');
    setCurrentImage(null);
    const stateToUse = currentState || storyState;
    try {
      const para = await generateStoryParagraph(stateToUse);
      setStoryState(prev => ({ ...prev, paragraphs: [para], currentParagraphIndex: 0 }));
      setBuklikText(`${stateToUse.childName}, я придумал начало нашей сказки! Давай прочитаем его вместе. Нажми на микрофон и прочти вслух.`);
    } catch (error) {
      setBuklikText("Ой, что-то пошло не так. Давай попробуем еще раз?");
    } finally {
      setIsGeneratingStory(false);
    }
  };

  const praises = [
    `Ого, ${storyState.childName}! Ты читаешь просто как настоящий волшебник! Я в восторге!`,
    `Умница, ${storyState.childName}! Каждое слово звучало так красиво! Давай я нарисую для тебя картинку...`,
    `Супер, ${storyState.childName}! Ты очень старался и у тебя отлично получилось! Сейчас будет магия...`,
    `Молодец, ${storyState.childName}! Твой голос такой приятный, мне очень нравится тебя слушать!`
  ];

  const processReading = async (base64Audio: string, mimeType: string) => {
    setIsProcessing(true);
    setEmotion('thinking');
    const currentPara = storyState.paragraphs[storyState.currentParagraphIndex];
    try {
      const result = await evaluateReading(base64Audio, currentPara, mimeType);
      if (result === 'SUCCESS') {
        const randomPraise = praises[Math.floor(Math.random() * praises.length)];
        
        setIsReadingCorrectly(true);
        setEmotion('excited');
        setBuklikText(randomPraise);
        handleSpeak(randomPraise);
        
        // Wait 4 seconds for the clap animation and praise to sink in
        setTimeout(async () => {
          setEmotion('excited'); // Keep the clapping animation active during image generation as requested!
          setBuklikText(`Каждая твоя строчка оживает! Сейчас я создам волшебную иллюстрацию для нашей сказки... ✨`);
          setIsGeneratingStory(true);
          try {
            const img = await generateStoryImage(storyState, currentPara);
            setCurrentImage(img);
            setHistory(prev => [...prev, { paragraph: currentPara, imageUrl: img }]);
            const branches = await generateStoryBranches(storyState);
            setSuggestions(branches);
          } catch (error) {
            console.error("Story generation/image error:", error);
            if (history.length === 0 || !history.find(h => h.paragraph === currentPara)) {
              setHistory(prev => [...prev, { paragraph: currentPara, imageUrl: null }]);
            }
          } finally {
            setIsGeneratingStory(false);
            setEmotion('happy');
          }
  
          setTimeout(() => {
            setIsReadingCorrectly(null);
            if (storyState.paragraphs.length < 4) {
              setStage('CHOOSE_NEXT');
              setBuklikText(`Какое интересное продолжение, ${storyState.childName}! О чем же мы напишем дальше? Выбирай путь!`);
            } else {
              setStage('COMPLETION');
              setEmotion('happy');
              setBuklikText(`Ура! Наша сказка готова! Ты настоящий мастер слова, ${storyState.childName}! Я горжусь тобой!`);
            }
          }, 3000);
        }, 4000);
      } else {
        setIsReadingCorrectly(false);
        setEmotion('idle');
        const retryMsg = `${storyState.childName}, я тебя не услышал. Давай попробуем прочитать еще раз, громко и четко. Ты справишься!`;
        setBuklikText(retryMsg);
        handleSpeak(retryMsg);
        setTimeout(() => {
          setIsReadingCorrectly(null);
          setEmotion('idle');
        }, 5000);
      }
    } catch (e) {
      console.error("Evaluation error:", e);
      const errorMsg = `Ой, ${storyState.childName}, что-то пошло не так. Давай попробуем прочитать этот кусочек еще раз.`;
      setBuklikText(errorMsg);
      handleSpeak(errorMsg);
      setIsReadingCorrectly(false);
      setEmotion('idle');
      setTimeout(() => setIsReadingCorrectly(null), 5000);
    } finally {
      setIsProcessing(false);
    }
  };

  const nextParagraph = async (idea: string) => {
    setIsGeneratingStory(true);
    setEmotion('thinking');
    setCurrentImage(null);
    setBuklikText(`Придумываю следующую главу нашей сказки... ✨`);
    try {
      const isEnding = storyState.paragraphs.length >= 3;
      const para = await generateStoryParagraph(storyState, idea, isEnding);
      
      setStoryState(prev => ({
        ...prev,
        paragraphs: [...prev.paragraphs, para],
        currentParagraphIndex: prev.currentParagraphIndex + 1
      }));
      setStage('STORY_TIME');
      setBuklikText(isEnding ? `${storyState.childName}, я придумал красивый финал нашей истории! Нажми на микрофон и прочитай его.` : `Какое интересное продолжение, ${storyState.childName}! Прочитай этот кусочек сказки.`);
    } finally {
      setIsGeneratingStory(false);
    }
  };

  useEffect(() => {
    setRandomTheme();
  }, []);

  const downloadBook = async () => {
    // We'll create a hidden container to render pages for html2canvas
    const storyContainer = document.createElement('div');
    storyContainer.style.position = 'fixed';
    storyContainer.style.left = '-9999px';
    storyContainer.style.top = '0';
    storyContainer.style.width = '800px'; 
    storyContainer.style.backgroundImage = theme.bg; 
    storyContainer.style.fontFamily = 'serif';
    document.body.appendChild(storyContainer);

    const doc = new jsPDF('p', 'mm', 'a4');
    
    // Cover Page
    const cover = document.createElement('div');
    cover.style.width = '800px';
    cover.style.height = '1131px';
    cover.style.backgroundImage = theme.bg;
    cover.style.padding = '40px';
    cover.style.boxSizing = 'border-box';
    cover.style.display = 'flex';
    cover.style.flexDirection = 'column';
    cover.style.alignItems = 'center';
    cover.style.justifyContent = 'center';
    cover.style.fontFamily = 'serif';
    cover.style.overflow = 'hidden';
    
    cover.innerHTML = `
      <div style="border: 20px solid ${theme.border}; box-sizing: border-box; width: 100%; height: 100%; padding: 40px; display: flex; flex-direction: column; align-items: center; justify-content: center; border-radius: 40px; background-color: ${theme.paper};">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="font-size: 58px; color: #5C3714; margin-bottom: 10px; font-weight: 900; line-height: 1.1;">Волшебная сказка</h1>
          <h2 style="font-size: 30px; color: #8B4513; margin-top: 0;">Автор: ${storyState.childName}</h2>
        </div>
        
        <div style="display: flex; align-items: center; justify-content: center; width: 85%; margin: 15px 0;">
          ${history[0]?.imageUrl ? `<img src="${history[0].imageUrl}" style="max-width: 100%; max-height: 480px; border-radius: 40px; border: 12px solid white; box-shadow: 0 30px 60px rgba(0,0,0,0.2);" />` : '<div style="font-size: 200px;">📖</div>'}
        </div>
        
        <div style="text-align: center; color: #5C3714; font-size: 24px; font-weight: bold; margin-top: 30px; opacity: 0.8;">
          С любовью от Буклика ✨
        </div>
      </div>
    `;
    storyContainer.appendChild(cover);

    // Wait for cover image to load
    const coverImg = cover.querySelector('img');
    if (coverImg) {
      await new Promise((resolve) => {
        if (coverImg.complete) resolve(null);
        coverImg.onload = () => resolve(null);
        coverImg.onerror = () => resolve(null);
        setTimeout(() => resolve(null), 2000); // safety timeout
      });
    }

    const canvasCover = await html2canvas(cover, { scale: 2, useCORS: true, logging: false });
    doc.addImage(canvasCover.toDataURL('image/jpeg', 1.0), 'JPEG', 0, 0, 210, 297);

    // Content Pages
    for (let i = 0; i < history.length; i++) {
      const item = history[i];
      doc.addPage();
      
      const page = document.createElement('div');
      page.style.width = '800px';
      page.style.height = '1131px';
      page.style.backgroundImage = theme.bg;
      page.style.padding = '40px';
      page.style.boxSizing = 'border-box';
      page.style.display = 'flex';
      page.style.flexDirection = 'column';
      page.style.justifyContent = 'center';
      page.style.fontFamily = 'serif';
      
      // Calculate font size based on text length to avoid overflow
      const fontSize = item.paragraph.length > 300 ? '22px' : '26px';
      
      page.innerHTML = `
        <div style="flex-grow: 1; display: flex; flex-direction: column; gap: 20px; border: 15px solid white; padding: 35px; border-radius: 40px; align-items: center; justify-content: flex-start; background-color: ${theme.paper}; overflow: hidden; box-sizing: border-box;">
          <div style="font-size: ${fontSize}; line-height: 1.4; color: #5C3714; text-align: center; font-weight: 700; margin-bottom: 5px; text-shadow: 0 1px 2px rgba(255,255,255,0.5); width: 100%; word-wrap: break-word;">
            ${item.paragraph}
          </div>
          ${item.imageUrl ? `<div style="width: 100%; display: flex; justify-content: center; flex-shrink: 1; overflow: hidden; margin-top: auto;"><img src="${item.imageUrl}" style="max-width: 100%; max-height: 480px; object-fit: contain; border-radius: 30px; border: 10px solid white; box-shadow: 0 15px 30px rgba(0,0,0,0.1);" /></div>` : ''}
        </div>
        <div style="text-align: right; color: #5C3714; font-size: 18px; opacity: 0.8; margin-top: 15px; font-weight: bold;">Страница ${i + 1}</div>
      `;
      
      storyContainer.innerHTML = ''; 
      storyContainer.appendChild(page);
      
      // Wait for image to load - crucial for PDF attachment
      const img = page.querySelector('img');
      if (img) {
        await new Promise((resolve) => {
          if (img.complete) {
            console.log("Image already loaded");
            resolve(null);
          }
          img.onload = () => {
            console.log("Image loaded on demand");
            resolve(null);
          };
          img.onerror = (e) => {
            console.error("Image load error for PDF", e);
            resolve(null);
          };
          setTimeout(() => {
            console.warn("Image load timeout");
            resolve(null);
          }, 3000); // 3 seconds timeout per image
        });
      }
      
      const canvasPage = await html2canvas(page, { 
        scale: 2, 
        useCORS: true, 
        logging: false,
        allowTaint: true,
        backgroundColor: null 
      });
      doc.addImage(canvasPage.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297);
    }
    
    document.body.removeChild(storyContainer);
    doc.save(`волшебная_сказка_${storyState.childName}.pdf`);
  };


  return (
    <div className="min-h-screen font-serif selection:bg-yellow-200 flex items-center justify-center p-3 sm:p-4" style={{ background: theme.bg }}>
      <main className="max-w-4xl w-full">
        
        {/* Main Magical Container with Glassmorphism */}
        <div className="w-full bg-white/40 backdrop-blur-2xl rounded-[40px] md:rounded-[80px] border-4 md:border-8 border-white/60 shadow-[0_30px_60px_rgba(92,55,20,0.3)] p-4 sm:p-8 md:p-16 relative overflow-hidden">
          
          {/* Top Info Bar */}
          <div className="flex justify-between items-center mb-6 md:mb-12 gap-2">
            <div className="flex flex-col items-center">
              <button 
                onClick={() => {
                  setVoiceEnabled(!voiceEnabled);
                  if (!voiceEnabled) handleSpeak("Голос включен!");
                }}
                className={`px-4 py-2 md:px-6 md:py-3 rounded-full text-[10px] md:text-xs font-black transition-all flex items-center gap-1.5 md:gap-2 border-2 shadow-lg ${voiceEnabled ? 'bg-[#FFE0B5] border-[#FFCF9A] text-[#3F2B1C]' : 'bg-white/50 border-white/80 text-gray-500'}`}
              >
                <Volume2 className="w-4 h-4 md:w-5 md:h-5" />
                {voiceEnabled ? 'ГОЛОС: ДА' : 'ГОЛОС: НЕТ'}
              </button>
              <p className="text-[8px] md:text-[10px] font-bold text-[#A65629]/60 mt-1 uppercase tracking-tighter">
                {isProcessing ? 'Буклик думает...' : (voiceEnabled ? 'Буклик говорит' : 'Буклик молчит')}
              </p>
            </div>
            <div className="text-center bg-white/50 px-4 py-1.5 md:px-8 md:py-2 rounded-full border-2 border-white/80 shadow-sm">
              <h1 className="text-lg md:text-4xl font-black text-[#A65629] tracking-tighter flex items-center gap-2 drop-shadow-sm">
                БУКЛИК
              </h1>
            </div>
            <div className="w-12 sm:w-24 md:w-32 hidden xs:block" />
          </div>

          <AnimatePresence mode="wait">
            {stage === 'WELCOME' && (
              <motion.div 
                key="welcome" 
                initial={{ opacity: 0, scale: 0.9 }} 
                animate={{ opacity: 1, scale: 1 }} 
                exit={{ opacity: 0, y: -50 }} 
                className="flex flex-col items-center space-y-6 md:space-y-12 py-2 md:py-6"
              >
                <BuklikAvatar emotion={emotion} isProcessing={isProcessing} stage={stage} />
                <div className="text-center space-y-4 md:space-y-8 max-w-2xl px-2">
                   <div className="bg-[#FFF5E0]/80 p-5 md:p-10 rounded-[30px] md:rounded-[50px] border-2 md:border-4 border-[#FFCF9A] shadow-xl relative backdrop-blur-sm">
                      <p className="text-base sm:text-2xl md:text-3xl text-[#8B4513] font-black leading-tight italic">
                        «Привет, дружок! Я твой волшебный друг Буклик. Давай вместе напишем сказку и нарисуем красивые картинки!»
                      </p>
                      <motion.div 
                        animate={{ y: [0, -5, 0] }} 
                        transition={{ duration: 2, repeat: Infinity }}
                        className="absolute -bottom-4 -right-4 md:-bottom-6 md:-right-6"
                      >
                         <Star className="w-8 h-8 md:w-12 md:h-12 text-[#F9D77E]" fill="#F9D77E" />
                      </motion.div>
                   </div>
                </div>
                <button 
                  onClick={() => {
                    setStage('NAME');
                    setEmotion('happy');
                    setBuklikText("Привет! Давай знакомиться. Как тебя зовут?");
                  }}
                  className="px-8 py-4 md:px-16 md:py-8 bg-[#FFB27F] text-white text-xl sm:text-2xl md:text-3xl font-black rounded-full shadow-[0_6px_0_#A65629] md:shadow-[0_12px_0_#A65629] hover:translate-y-1 hover:shadow-[0_3px_0_#A65629] md:hover:translate-y-2 md:hover:shadow-[0_6px_0_#A65629] transition-all active:scale-95 group relative overflow-hidden"
                >
                  <span className="flex items-center gap-2 md:gap-4 relative z-10">
                    НАЧНЁМ СКАЗКУ!
                  </span>
                  <motion.div 
                    initial={{ x: '-100%' }}
                    whileHover={{ x: '100%' }}
                    transition={{ duration: 0.8 }}
                    className="absolute inset-0 bg-white/20 skew-x-12"
                  />
                </button>
              </motion.div>
            )}

            {(['NAME', 'GENDER', 'HERO', 'LOCATION', 'FRIEND', 'CHOOSE_NEXT'].includes(stage)) && (
              <motion.div key="q" initial={{ opacity: 0, x: 100 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col items-center space-y-6 md:space-y-12">
                <BuklikAvatar emotion={emotion} isProcessing={isProcessing} stage={stage} />
                <div className="bg-white/80 p-5 md:p-10 rounded-[30px] md:rounded-[40px] border-2 md:border-4 border-[#FFCF9A] shadow-lg text-lg sm:text-2xl md:text-3xl font-black text-[#A65629] text-center w-full max-w-2xl leading-relaxed relative flex flex-col items-center gap-3">
                  <span>{buklikText}</span>
                  <button 
                    onClick={() => handleSpeak(buklikText)}
                    className="p-1.5 md:p-2 bg-[#FFCF9A] rounded-full hover:bg-[#FFB27F] transition-colors"
                    title="Повторить"
                  >
                    <Volume2 className="w-5 h-5 md:w-6 md:h-6" />
                  </button>
                </div>
                
                <div className="w-full max-w-2xl space-y-6 md:space-y-10">
                  <div className="flex flex-wrap gap-2 md:gap-4 justify-center">
                    {suggestions.map(s => (
                      <button 
                        key={s} 
                        onClick={() => handleStep(s)} 
                        className="px-5 py-2.5 md:px-10 md:py-5 bg-[#FFF0D9] border-2 md:border-4 border-[#FFB27F] rounded-full font-black text-xs sm:text-sm md:text-xl hover:bg-[#FFB27F] hover:text-white transition-all transform hover:scale-105 active:scale-95 shadow-md md:shadow-xl"
                      >
                        {s}
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-2.5 md:gap-4 items-center w-full pb-4">
                    <input 
                      type="text" 
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleStep(inputText)}
                      placeholder="Напиши здесь..." 
                      className="flex-grow p-4 md:p-7 rounded-full border-2 md:border-4 border-[#FFCF9A] focus:border-[#FFB27F] outline-none text-base sm:text-lg md:text-2xl font-bold shadow-lg md:shadow-2xl bg-white/90 min-w-0"
                    />
                    <button 
                      onClick={() => handleStep(inputText)}
                      className="w-14 h-14 md:w-28 md:h-28 bg-[#FFB27F] text-white rounded-full flex items-center justify-center shadow-lg md:shadow-2xl hover:scale-105 active:scale-95 transition-all shrink-0"
                    >
                      <ArrowRight className="w-6 h-6 md:w-12 md:h-12" />
                    </button>
                    <button 
                      onClick={() => {
                        if (isRecording) {
                          stopRecording();
                        } else {
                          startRecording();
                        }
                      }}
                      className={`w-14 h-14 md:w-28 md:h-28 rounded-full flex items-center justify-center transition-all shadow-lg md:shadow-2xl active:scale-90 touch-none shrink-0 ${isRecording ? 'bg-red-500 animate-pulse ring-4 md:ring-8 ring-red-100' : 'bg-[#A7D0CD] hover:bg-[#8FBCB8] shadow-[0_4px_0_#6E9E9A] md:shadow-[0_10px_0_#6E9E9A] hover:translate-y-[-2px] md:hover:translate-y-[-2px] active:translate-y-[4px] active:shadow-none'}`}
                    >
                      {isRecording ? <MicOff className="w-6 h-6 md:w-12 md:h-12 text-white" /> : <Mic className="w-6 h-6 md:w-12 md:h-12 text-white" />}
                    </button>
                  </div>
                  
                  {isRecording && (
                    <motion.p 
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="text-center font-black text-red-500 text-sm sm:text-lg md:text-2xl tracking-widest uppercase"
                    >
                      Я тебя слушаю...
                    </motion.p>
                  )}
                </div>
              </motion.div>
            )}

            {stage === 'STORY_TIME' && (
              <motion.div key="story" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center space-y-6 md:space-y-12">
                <BuklikAvatar emotion={emotion} isProcessing={isProcessing} stage={stage} />
                
                <div className="p-5 md:p-12 rounded-[30px] md:rounded-[50px] border-4 md:border-8 shadow-2xl relative w-full group backdrop-blur-md" style={{ backgroundColor: `${theme.paper}E6`, borderColor: theme.border }}>
                   <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-100 transition-opacity">
                      <Music className="w-6 h-6 md:w-10 md:h-10" />
                   </div>
                   <div className="absolute -top-4 md:-top-6 left-1/2 -translate-x-1/2 text-white px-4 py-2 md:px-8 md:py-3 rounded-xl md:rounded-2xl font-black text-sm sm:text-2xl shadow-xl z-20 whitespace-nowrap uppercase tracking-widest" style={{ backgroundColor: theme.accent }}>
                    Читай вслух
                  </div>
                  <p className="text-base sm:text-xl md:text-2xl font-black leading-relaxed text-[#5C3714] tracking-wide text-center drop-shadow-sm pt-4 px-2 md:px-4">
                    {storyState.paragraphs[storyState.currentParagraphIndex]}
                  </p>
                  <div className="flex justify-center mt-4">
                    <button 
                      onClick={() => handleSpeak(storyState.paragraphs[storyState.currentParagraphIndex])}
                      className="p-2 sm:p-3 rounded-full text-white shadow-lg transition-transform hover:scale-110 active:scale-95"
                      style={{ backgroundColor: theme.accent }}
                      title="Прослушать еще раз"
                    >
                      <Volume2 className="w-5 h-5 md:w-6 md:h-6" />
                    </button>
                  </div>
                </div>

                <div className="grid md:grid-cols-[1fr_2fr] gap-6 md:gap-8 w-full items-center">
                  <div className="flex flex-col items-center space-y-3 md:space-y-6">
                    <button 
                      onClick={() => {
                        if (isRecording) {
                          stopRecording();
                        } else {
                          startRecording();
                        }
                      }}
                      className={`w-20 h-20 md:w-28 md:h-28 rounded-full flex items-center justify-center transition-all shadow-[0_10px_20px_rgba(0,0,0,0.15)] md:shadow-[0_15px_30px_rgba(0,0,0,0.2)] hover:scale-110 active:scale-95 touch-none shrink-0 ${isRecording ? 'bg-red-500 animate-pulse ring-4 md:ring-8 ring-red-100' : 'bg-[#5A5A40] shadow-[0_4px_0_#3A3A25] md:shadow-[0_8px_0_#3A3A25] translate-y-[-2px] md:translate-y-[-4px] active:translate-y-0 active:shadow-none'}`}
                    >
                      {isRecording ? <MicOff className="w-8 h-8 md:w-12 md:h-12 text-white" /> : <Mic className="w-8 h-8 md:w-12 md:h-12 text-white" />}
                    </button>
                    <div className="text-center bg-white/80 px-4 py-2 md:px-6 md:py-3 rounded-[20px] md:rounded-[30px] border-2 md:border-4 border-white shadow-lg">
                      <p className="text-[10px] md:text-sm font-black text-[#5A5A40] uppercase tracking-wider">{isRecording ? "Я слушаю!" : "Жми и читай"}</p>
                    </div>
                  </div>

                  <div className="aspect-[4/3] bg-white/60 p-2 md:p-3 rounded-[30px] md:rounded-[60px] border-4 md:border-8 border-white flex items-center justify-center overflow-hidden relative shadow-2xl backdrop-blur-sm w-full">
                    {currentImage ? (
                      <motion.img initial={{ opacity: 0 }} animate={{ opacity: 1 }} src={currentImage} className="w-full h-full object-cover rounded-[20px] md:rounded-[50px]" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="text-center p-4 md:p-8 space-y-3 md:space-y-6 opacity-30">
                        <Camera className="mx-auto text-yellow-500 w-10 h-10 md:w-16 md:h-16" />
                        <p className="text-xs sm:text-lg font-black leading-tight max-w-[200px] mx-auto uppercase text-[#5C3714]">Тут появится твоя картинка!</p>
                      </div>
                    )}
                    {isReadingCorrectly === true && (
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute top-3 right-3 md:top-6 md:right-6 bg-green-500 rounded-full p-2 md:p-4 shadow-xl">
                        <CheckCircle2 className="text-white w-6 h-6 md:w-10 md:h-10" />
                      </motion.div>
                    )}
                    {isReadingCorrectly === false && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-red-500/10 flex items-center justify-center">
                        <motion.div className="bg-white/90 px-4 py-2 md:px-6 md:py-4 rounded-xl md:rounded-2xl shadow-xl border-2 md:border-4 border-red-400">
                          <p className="text-sm md:text-xl font-black text-red-600">ПОПРОБУЙ ЕЩЁ!</p>
                        </motion.div>
                      </motion.div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {stage === 'COMPLETION' && (
              <motion.div key="done" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center space-y-6 md:space-y-12 py-4 md:py-10">
                <div className="relative">
                  <BuklikAvatar emotion={emotion} isProcessing={isProcessing} stage={stage} />
                  {/* Magical Sparkles, Stars and Hearts positioned beautifully around the large Buklik */}
                  <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                    <Sparkles className="absolute -top-6 -right-6 md:-top-12 md:-right-12 text-yellow-400 drop-shadow-2xl animate-pulse w-14 h-14 md:w-32 md:h-32" size={120} />
                    <motion.div animate={{ scale: [1, 1.25, 1] }} transition={{ duration: 1.5, repeat: Infinity }} className="absolute -bottom-4 -left-4">
                      <Heart className="text-red-400 drop-shadow-2xl w-12 h-12 md:w-24 md:h-24" size={100} fill="currentColor" />
                    </motion.div>
                    <motion.div animate={{ y: [0, -15, 0] }} transition={{ duration: 2, repeat: Infinity }} className="absolute -top-10 -left-6 text-yellow-300">
                      <Star className="w-10 h-10 md:w-16 md:h-16 drop-shadow-lg" size={72} fill="currentColor" />
                    </motion.div>
                  </div>
                </div>
                
                <div className="text-center space-y-4 md:space-y-8 px-4">
                  <h2 className="text-4xl sm:text-6xl md:text-8xl font-black text-[#A65629] drop-shadow-2xl uppercase tracking-tighter">ТЫ СУПЕР!</h2>
                  <div className="bg-white/90 px-6 py-5 md:px-12 md:py-10 rounded-[30px] md:rounded-[60px] shadow-2xl border-4 md:border-6 border-white/80 max-w-2xl backdrop-blur-md">
                    <p className="text-lg sm:text-3xl md:text-4xl font-black text-[#3F2B1C] leading-snug">
                      У нас получилась самая чудесная сказка! Ты — настоящий писатель, {storyState.childName}!
                    </p>
                  </div>
                </div>

                {/* Story Preview */}
                <div className="w-full max-w-3xl space-y-4 md:space-y-8 p-3 sm:p-6 bg-white/40 rounded-[30px] md:rounded-[50px] border-2 md:border-4 border-white">
                  {history.map((item, idx) => (
                    <div key={idx} className="flex flex-col gap-4 p-4 md:p-6 bg-white/60 rounded-[20px] md:rounded-[40px] border border-white">
                      <p className="text-base sm:text-2xl font-bold text-[#5C3714] leading-relaxed">{item.paragraph}</p>
                      {item.imageUrl && (
                        <img src={item.imageUrl} className="w-full rounded-[20px] md:rounded-[30px] shadow-lg" alt={`Paragraph ${idx + 1}`} referrerPolicy="no-referrer" />
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex flex-col sm:flex-row gap-4 md:gap-10 w-full max-w-3xl px-4 animate-bounce-short">
                  <button onClick={downloadBook} className="flex-1 px-6 py-4 md:px-12 md:py-10 bg-[#D9B8C4] rounded-[24px] md:rounded-[50px] border-4 md:border-8 border-[#FFB27F] font-black text-xl md:text-3xl shadow-[0_6px_0_#A65629] md:shadow-[0_15px_0_#A65629] flex items-center gap-3 md:gap-6 justify-center hover:bg-[#C9A8B4] transition-all transform hover:translate-y-1 md:hover:translate-y-2 hover:shadow-[0_3px_0_#A65629] md:hover:shadow-[0_8px_0_#A65629] active:translate-y-2 active:shadow-none">
                    <Download className="w-6 h-6 md:w-12 md:h-12" /> КНИГА
                  </button>
                  <button onClick={() => window.location.reload()} className="flex-1 px-6 py-4 md:px-12 md:py-10 bg-white border-4 md:border-8 border-[#5A5A40] rounded-[24px] md:rounded-[50px] font-black text-xl md:text-3xl shadow-[0_6px_0_#3A3A25] md:shadow-[0_15px_0_#3A3A25] flex items-center gap-3 md:gap-6 justify-center hover:bg-gray-50 transition-all transform hover:translate-y-1 md:hover:translate-y-2 hover:shadow-[0_3px_0_#3A3A25] md:hover:shadow-[0_8px_0_#3A3A25] active:translate-y-2 active:shadow-none">
                    <RefreshCcw className="w-6 h-6 md:w-12 md:h-12" /> EЩЁ!
                  </button>
                </div>
              </motion.div>
            )}

          </AnimatePresence>

          {/* Magical Processing Overlay */}
          <AnimatePresence>
            {isGeneratingStory && (
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }} 
                className="absolute inset-0 bg-gradient-to-br from-[#FFDEE9] via-[#E4E9FF] to-[#DBF9FF] z-[200] flex flex-col items-center justify-center rounded-[40px] md:rounded-[80px] border-4 md:border-[12px] border-white/60 overflow-hidden shadow-inner"
              >
                {/* Magical Background Particles */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                  {[...Array(40)].map((_, i) => (
                    <motion.div
                      key={i}
                      animate={{ 
                        y: [1000, -200],
                        x: [Math.random() * 1000, Math.random() * 1000],
                        opacity: [0, 0.8, 0],
                        scale: [0, Math.random() * 2.5, 0],
                        rotate: [0, 360]
                      }}
                      transition={{ 
                        duration: 3 + Math.random() * 5, 
                        repeat: Infinity, 
                        delay: Math.random() * 5,
                        ease: "linear"
                      }}
                      className="absolute w-6 h-6 text-yellow-500 opacity-40"
                    >
                      <Sparkles fill="currentColor" />
                    </motion.div>
                  ))}
                </div>

                <div className="relative z-10 flex flex-col items-center">
                  <div className="relative mb-6 flex justify-center">
                    <BuklikAvatar emotion={emotion} isProcessing={isProcessing} stage={stage} />
                    <div className="absolute -top-4 -right-4 text-yellow-400 drop-shadow-lg animate-bounce z-25">
                      <Sparkles className="w-10 h-10 md:w-14 md:h-14" fill="currentColor" />
                    </div>
                  </div>
                  <motion.p 
                    animate={{ scale: [1, 1.02, 1], y: [0, -2, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="mt-4 text-lg sm:text-2xl md:text-3xl lg:text-4xl font-black text-[#5C3714] tracking-tight text-center px-4 md:px-8 max-w-2xl drop-shadow-[0_2px_10px_rgba(255,255,255,0.8)] font-serif italic leading-relaxed"
                  >
                    {buklikText.length < 120 ? buklikText : 'БУКЛИК КОЛДУЕТ...'}
                  </motion.p>
                  <p className="mt-4 text-xs sm:text-xl text-[#8B4513] font-bold tracking-[0.1em] uppercase opacity-70 px-4 text-center">Творим волшебство специально для тебя... ✨</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <audio ref={audioPlayerRef} className="hidden" />

        <footer className="mt-8 md:mt-16 text-center text-white/90 font-black space-y-4 md:space-y-8 w-full pb-8 md:pb-12">
          <div className="flex justify-center gap-6 md:gap-12">
            <motion.div animate={{ y: [0, -10, 0] }} transition={{ duration: 3, repeat: Infinity }}><Cloud className="w-10 h-10 md:w-16 md:h-16 drop-shadow-lg" /></motion.div>
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }}><Sun className="w-10 h-10 md:w-16 md:h-16 text-yellow-400 drop-shadow-lg" /></motion.div>
            <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 2, repeat: Infinity }}><Heart className="w-10 h-10 md:w-16 md:h-16 text-red-400 drop-shadow-lg" fill="currentColor" /></motion.div>
          </div>
          <div className="space-y-2 md:space-y-4 px-4">
            <p className="text-xs sm:text-lg tracking-[0.2em] md:tracking-[0.3em] uppercase opacity-70">Волшебный мир для маленьких создателей книг</p>
            <div className="h-1.5 md:h-2 w-32 md:w-48 bg-white/40 mx-auto rounded-full shadow-inner" />
          </div>
        </footer>
      </main>
    </div>
  );
}
