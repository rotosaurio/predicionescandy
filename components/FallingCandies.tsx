import React, { useEffect, useState } from 'react';

interface CandyProps {
  count?: number;
}

interface Candy {
  id: number;
  icon: string;
  x: number;
  delay: number;
  duration: number;
  size: number;
  rotation: number;
}

const FallingCandies: React.FC<CandyProps> = ({ count = 20 }) => {
  const [candies, setCandies] = useState<Candy[]>([]);

  useEffect(() => {
    const icons = ['🍬', '🍭', '🧁', '🍫', '🍩'];
    const newCandies: Candy[] = [];
    
    for (let i = 0; i < count; i++) {
      newCandies.push({
        id: i,
        icon: icons[Math.floor(Math.random() * icons.length)],
        x: Math.random() * 100, // Random position between 0-100%
        delay: Math.random() * 8, // Random delay between 0-8s
        duration: 5 + Math.random() * 10, // Animation duration between 5-15s
        size: 16 + Math.random() * 24, // Size between 16-40px
        rotation: Math.random() * 360, // Random rotation
      });
    }
    
    setCandies(newCandies);
  }, [count]);

  useEffect(() => {
    // Add keyframe animation to head
    const style = document.createElement('style');
    style.innerHTML = `
      @keyframes candyFall {
        0% {
          transform: translateY(-50px) rotate(0deg);
          opacity: 0;
        }
        10% {
          opacity: 0.3;
        }
        100% {
          transform: translateY(100vh) rotate(360deg);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return (
    <div className="fixed inset-0 w-full h-full pointer-events-none z-0 overflow-hidden">
      {candies.map((candy) => (
        <div
          key={candy.id}
          className="absolute"
          style={{
            left: `${candy.x}%`,
            top: '-30px',
            fontSize: `${candy.size}px`,
            transform: `rotate(${candy.rotation}deg)`,
            animation: `candyFall ${candy.duration}s linear ${candy.delay}s infinite`,
            opacity: 0.3,
          }}
        >
          {candy.icon}
        </div>
      ))}
    </div>
  );
};

export default FallingCandies;
