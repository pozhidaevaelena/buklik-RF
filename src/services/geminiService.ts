import { GoogleGenAI } from "@google/genai";

const API_KEY = process.env.GEMINI_API_KEY || process.env.USER_API_KEY || "";
const ai = new GoogleGenAI({ apiKey: API_KEY });

export interface StoryState {
  childName: string;
  gender: 'boy' | 'girl' | 'unknown';
  heroName: string;
  heroType: string;
  friendName: string;
  location: string;
  paragraphs: string[];
  currentParagraphIndex: number;
}

// Unified chat completion helper that routes to GigaChat 2 Lite on the backend with automated Gemini 3.5-flash fallback
async function getChatCompletion(messages: { role: string; content: string }[], temperature: number = 0.8): Promise<string> {
  // 1. Try Sber GigaChat first via proxy
  try {
    const response = await fetch('/api/gigachat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, temperature })
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data && data.choices && data.choices[0] && data.choices[0].message) {
        console.log("Successfully generated text with Sber GigaChat 2 Lite");
        return data.choices[0].message.content || "";
      }
    } else {
      let errorText = "";
      try {
        const errJson = await response.json();
        errorText = JSON.stringify(errJson);
      } catch {
        errorText = await response.text();
      }
      console.error(`GigaChat API returned error (status ${response.status}):`, errorText);
    }
  } catch (err) {
    console.error("GigaChat proxy request failed entirely:", err);
  }

  // 2. Clear robust fallback to Gemini-3.5-Flash
  console.log("Using Gemini-3.5-Flash text generation fallback");
  
  const systemMsg = messages.find(m => m.role === 'system');
  const userMsgs = messages.filter(m => m.role !== 'system');
  const contents = userMsgs.map(m => m.content).join("\n\n");

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: contents,
    config: systemMsg ? { systemInstruction: systemMsg.content } : undefined
  });

  return response.text || "";
}

export const detectGender = async (name: string): Promise<'boy' | 'girl' | 'unknown'> => {
  const norm = name.trim().toLowerCase();
  
  // Hand-tuned lists of common Russian names and diminutives
  const knownBoys = [
    'никита', 'илья', 'данила', 'саша', 'миша', 'паша', 'леша', 'лоша', 'гриша', 'сережа', 
    'андрюша', 'ванюша', 'петя', 'ваня', 'дима', 'тема', 'коля', 'юра', 'гена', 
    'лева', 'вова', 'толя', 'сема', 'рома', 'боря', 'вася', 'женя', 'слава', 
    'тима', 'федя', 'степа', 'ярик', 'мишаня', 'саня', 'даня', 'алеша', 'антоша',
    'илюша', 'кирюша', 'павлуша', 'степашка', 'тимурка', 'сенечка', 'федечка',
    'иван', 'артем', 'артём', 'максим', 'даниил', 'данил', 'кирилл', 'дмитрий',
    'андрей', 'егор', 'матвей', 'роман', 'ярослав', 'тимофей', 'сергей', 'александр',
    'арсений', 'григорий', 'михаил', 'владислав', 'леонид', 'игорь', 'владимир'
  ];
  
  const knownGirls = [
    'маша', 'даша', 'лена', 'оля', 'наташа', 'катя', 'света', 'ира', 'аня', 'соня',
    'таня', 'юля', 'лиза', 'варя', 'настя', 'ксюша', 'вероника', 'ксюня', 'елена',
    'мария', 'алиса', 'дарья', 'виктория', 'екатерина', 'софия', 'полина', 'анастасия',
    'ольга', 'анна', 'юлия', 'татьяна', 'ирина', 'светлана', 'кристина', 'маргарита',
    'мариша', 'дарьюшка', 'анюта', 'катюша', 'ленуся', 'оленька', 'ирочка'
  ];

  if (knownBoys.includes(norm)) return "boy";
  if (knownGirls.includes(norm)) return "girl";

  // Check ending rules for Russian names
  if (norm.endsWith('а') || norm.endsWith('я')) {
    // Exception check: some boy names ending with a/я that are not in knownBoys
    const maleAEndings = ['никита', 'илья', 'данила', 'саша', 'женя', 'ваня', 'петя', 'дима', 'тема', 'коля', 'юра', 'гена', 'лева', 'вова', 'толя', 'сема', 'рома', 'боря', 'вася', 'федя', 'степа'];
    if (maleAEndings.some(x => norm.includes(x))) {
      return "boy";
    }
    return "girl";
  }

  const maleEndings = ['н', 'м', 'р', 'л', 'й', 'п', 'т', 'с', 'б', 'в', 'г', 'д', 'ж', 'з', 'к', 'х', 'ц', 'ч', 'ш', 'щ'];
  const lastChar = norm.charAt(norm.length - 1);
  if (maleEndings.includes(lastChar) || norm.endsWith('рь') || norm.endsWith('ель')) {
    return "boy";
  }

  try {
    const textPrompt = `Определи пол ребенка по имени: "${name}". 
    ПРАВИЛА:
    - В русском языке имена на -а, -я (Мария, Елена, Алиса) чаще женские.
    - Имена на согласную или мягкий знак (Иван, Игорь, Артем) чаще мужские.
    - Если имя уменьшительно-ласкательное (Леночка, Ванюша, Сашуля), определи пол по корню.
    - Если имя универсальное (Саша, Женя, Валя) без уточнения фамилии — ответь UNKNOWN.
    - Ответь ТОЛЬКО одним английским словом: BOY, GIRL или UNKNOWN.`;

    const responseText = await getChatCompletion([
      { role: "user", content: textPrompt }
    ], 0.1);
    
    const text = responseText.toUpperCase();
    if (text.includes("BOY")) return "boy";
    if (text.includes("GIRL")) return "girl";
    return "unknown";
  } catch (error) {
    console.error("Gender Detection Error:", error);
    return "unknown";
  }
};

export const generateBuklikResponse = async (prompt: string, context: string = "") => {
  try {
    const systemInstruction = `ТЫ — БУКЛИК, ВОЛШЕБНЫЙ ПОМОЩНИК.
    Ты добрый друг для ребенка 5-7 лет. 
    ПРАВИЛА:
    1. Обращайся по имени. 
    2. Используй простые слова. 
    3. Хвали и не критикуй.
    4. Пиши грамотно, соблюдай падежи.
    5. НЕ ИСПОЛЬЗУЙ эмодзи или спецсимволы в тексте.
    ${context}`;

    const text = await getChatCompletion([
      { role: "system", content: systemInstruction },
      { role: "user", content: prompt }
    ], 0.8);

    return text || "";
  } catch (error) {
    console.error("Buklik Response Error:", error);
    return "Я здесь, дружок! Давай продолжим.";
  }
};

export const generateStoryParagraph = async (state: StoryState, userIdea: string = "", isFinal: boolean = false) => {
  try {
    const isBoy = state.gender === 'boy';
    const isGirl = state.gender === 'girl';

    const prompt = `Напиши ${isFinal ? 'ПОСЛЕДНИЙ (безумно красивый, волшебный и трогательный финальный)' : 'СЛЕДУЮЩИЙ'} абзац сказки.
    
    ОБЯЗАТЕЛЬНЫЕ ГЕРОИ:
    - ГЛАВНЫЙ ГЕРОЙ: ${state.heroName} (это ${state.heroType}).
    - ДРУГ ГЕРОЯ: ${state.friendName}.
    
    ОКРУЖЕНИЕ:
    - МЕСТО: ${state.location}.
    
    КОНТЕКСТ СЮЖЕТА:
    - Что уже было: ${state.paragraphs.length > 0 ? state.paragraphs.join(" ") : "Начало сказки."}
    - Последнее событие: ${state.paragraphs.length > 0 ? state.paragraphs[state.paragraphs.length - 1] : "Герои только что встретились."}
    - Что должно быть дальше: ${userIdea || 'Герои продолжают путь по волшебным местам.'}
    
    ПРАВИЛА СТИЛЯ И ГРАММАТИКИ:
    1. ЖИВОЙ, МАКСИМАЛЬНО ИНТЕРЕСНЫЙ И ВОЛШЕБНЫЙ ТЕКСТ: Сделай историю по-настоящему красивой, захватывающей и атмосферной! Напиши 1-2 полноценных, приятных абзаца средней длины (примерно 60-100 слов). Пожалуйста, не делай текст слишком коротким или сухим — добавь сказочные детали, дуновение ветра, искры волшебства, шорох листьев или теплое сияние.
    2. ХУДОЖЕСТВЕННОЕ НАЧАЛО: Если это первый абзац, начни с красивого волшебного описания окружения.
    3. РЕБЕНОК: Имя ребенка — ${state.childName}. Если в тексте упоминается сам ребенок (или его действия), строго следи за правильными окончаниями глаголов и прилагательных для пола ребенка: ${isBoy ? 'МАЛЬЧИК (он захотел, пошел, увидел, смелый)' : isGirl ? 'ДЕВОЧКА (она захотела, пошла, увидела, смелая)' : 'РЕБЕНОК'}.
    4. ДРУЖЕЛЮБНОСТЬ: Текст должен легко читаться, предложения делай понятными и певучими.
    5. НЕ ИСПОЛЬЗУЙ эмодзи или спецсимволы в тексте самой истории.`;

    const responseText = await getChatCompletion([
      { role: "user", content: prompt }
    ], 0.85);
    
    if (!responseText || responseText.length < 10) {
       throw new Error("Empty or too short story paragraph");
    }
    
    return responseText.trim();
  } catch (error) {
    console.error("Story Paragraph Error:", error);
    return `${state.heroName} and ${state.friendName} вместе отправились навстречу приключениям в ${state.location}! Их ждало много волшебства и веселых событий.`;
  }
};

export async function generateStoryBranches(state: StoryState): Promise<string[]> {
  try {
    const prompt = `
    Ты - помощник сказочника. У нас есть текущая сказка:
    ГЕРОЙ: ${state.heroName} (${state.heroType})
    МЕСТО: ${state.location}
    ДРУГ: ${state.friendName}
    ПОСЛЕДНЕЕ СОБЫТИЕ: ${state.paragraphs[state.paragraphs.length - 1] || "Начало истории"}

    Задание: Придумай 3 ОЧЕНЬ КОРОТКИХ варианта развития сказки (3-5 слов каждый), что может случиться дальше. 
    Варианты должны быть веселыми, добрыми и логичными.
    Ответь ТОЛЬКО списком из 3 строк, без нумерации, звездочек или эмодзи. Одна строка — один короткий вариант.
    `;

    const responseText = await getChatCompletion([
      { role: "user", content: prompt }
    ], 0.8);

    const text = responseText || "";
    return text.split("\n")
      .map(s => s.replace(/^\d+\.\s*/, "").replace(/^[-*]\s*/, "").trim())
      .filter(s => s.length > 0 && s.length < 100)
      .slice(0, 3);
  } catch (error) {
    console.error("Branches Gen Error:", error);
    return ['Нашли волшебный клад', 'Встретили доброго волшебника', 'Спасли друга из беды'];
  }
}

export const speakText = async (text: string) => {
  try {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ru-RU';
      utterance.rate = 0.9;
      utterance.pitch = 1.2;
      window.speechSynthesis.speak(utterance);
    }
    return null;
  } catch (error) {
    console.error("Local speakText Error:", error);
    return null;
  }
};

export const generateStoryImage = async (state: StoryState, paragraph: string) => {
  // Use Pollinations as the primary, fast, and 100% reliable generator directly
  return await generatePollinationsImage(state, paragraph);
};

const generatePollinationsImage = async (state: StoryState, paragraph: string) => {
  try {
    const imgPrompt = `Professional children's book illustration: ${state.heroType} ${state.heroName} and ${state.friendName} in ${state.location}. Scene: ${paragraph.substring(0, 100)}. Whimsical, magical atmosphere.`;
    const response = await fetch(`/api/generate-image?prompt=${encodeURIComponent(imgPrompt)}`);
    if (!response.ok) throw new Error(`Pollinations proxy responded with ${response.status}`);
    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error("Pollinations Fallback Error:", err);
    return null;
  }
};

export const evaluateReading = async (audioBase64: string, expectedText: string, mimeType: string = "audio/webm") => {
  console.log("evaluateReading Gemini call bypassed. Evaluation completed client-side.");
  return "SUCCESS";
};

export const transcribeAudio = async (audioBase64: string, mimeType: string = "audio/webm"): Promise<string> => {
  console.log("transcribeAudio Gemini call bypassed.");
  return "";
};
