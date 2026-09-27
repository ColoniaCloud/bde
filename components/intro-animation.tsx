'use client';

import { useEffect, useState } from 'react';

const WORDS = [
  { text: 'Salud', style: 'font-normal' },
  { text: 'Belleza', style: 'italic font-semibold' },
  { text: 'Estética', style: 'font-bold' },
  { text: 'Naturaleza', style: 'italic font-medium' },
  { text: 'Playa', style: 'font-semibold' },
];

export function IntroAnimation() {
  const [stage, setStage] = useState<'blur' | 'words' | 'opening' | 'done'>('blur');
  const [wordIndex, setWordIndex] = useState(0);

  useEffect(() => {
    // Si ya se mostró la animación en esta sesión, no repetirla
    if (typeof window !== 'undefined' && sessionStorage.getItem('bde_intro_seen')) {
      setStage('done');
      return;
    }

    // Paso 1: Entrada Blurred del Logo (500ms)
    const timer1 = setTimeout(() => {
      setStage('words');
    }, 550);

    return () => clearTimeout(timer1);
  }, []);

  useEffect(() => {
    if (stage !== 'words') return;

    // Paso 2: Transición rápida de palabras (240ms por palabra)
    let current = 0;
    const interval = setInterval(() => {
      current += 1;
      if (current < WORDS.length) {
        setWordIndex(current);
      } else {
        clearInterval(interval);
        // Transición completada, pasar a apertura circular y desplazamiento
        setTimeout(() => {
          setStage('opening');
        }, 150);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [stage]);

  useEffect(() => {
    if (stage !== 'opening') return;

    // Paso 3: Duración de la apertura circular y ajuste del logo
    const timer = setTimeout(() => {
      setStage('done');
      sessionStorage.setItem('bde_intro_seen', 'true');
    }, 900);

    return () => clearTimeout(timer);
  }, [stage]);

  if (stage === 'done') return null;

  const currentWord = WORDS[wordIndex];

  return (
    <div
      className={`intro-overlay ${stage === 'opening' ? 'opening' : ''}`}
      aria-hidden="true"
    >
      <div className={`intro-content ${stage === 'opening' ? 'opening-logo' : ''}`}>
        <img
          src="/LOG%20OK.png"
          alt="Boutique del Este Logo Intro"
          className={`intro-logo ${stage === 'blur' ? 'blur-entry' : 'sharp'}`}
        />

        <div className="intro-words-wrapper">
          {stage === 'words' && (
            <span key={wordIndex} className={`intro-word ${currentWord.style}`}>
              {currentWord.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
