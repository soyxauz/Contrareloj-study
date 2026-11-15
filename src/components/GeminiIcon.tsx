import React, { useId } from 'react';

export interface GeminiIconProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
  variant?: 'gradient' | 'monochrome' | 'gemini-purple' | 'gemini-blue';
  duo?: boolean; // Chispa principal + chispa compañera en la esquina superior derecha (estilo Google Workspace)
}

/**
 * Path estándar de la estrella cuádruple orgánica de Google Gemini con puntas suavizadas
 */
const GEMINI_STAR_PATH =
  'M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.93.93.42 1.74.96t1.53 1.35 1.2 1.71 1.05 2.07z';

export const GeminiIcon: React.FC<GeminiIconProps> = ({
  className = 'w-4 h-4',
  variant = 'gradient',
  duo = false,
  ...props
}) => {
  const reactId = useId();
  const gradId = `gemini-grad-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const getFill = () => {
    switch (variant) {
      case 'monochrome':
        return 'currentColor';
      case 'gemini-purple':
        return '#8E75FF';
      case 'gemini-blue':
        return '#388BFD';
      case 'gradient':
      default:
        return `url(#${gradId})`;
    }
  };

  const fill = getFill();

  return (
    <svg
      viewBox="0 0 24 24"
      className={`shrink-0 select-none ${className}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      {variant === 'gradient' && (
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4285F4" />
            <stop offset="35%" stopColor="#9B72CF" />
            <stop offset="70%" stopColor="#D96570" />
            <stop offset="100%" stopColor="#FBBC05" />
          </linearGradient>
        </defs>
      )}

      {duo ? (
        <g>
          {/* Chispa principal */}
          <path
            d={GEMINI_STAR_PATH}
            fill={fill}
            transform="translate(0.5, 4.5) scale(0.72)"
          />
          {/* Chispa secundaria acompañante en la esquina superior derecha */}
          <path
            d={GEMINI_STAR_PATH}
            fill={fill}
            transform="translate(13.5, 0.5) scale(0.38)"
            opacity={0.88}
          />
        </g>
      ) : (
        <path d={GEMINI_STAR_PATH} fill={fill} />
      )}
    </svg>
  );
};
