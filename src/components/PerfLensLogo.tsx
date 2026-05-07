import logoUrl from '../assets/logo.png';

interface PerfLensLogoProps {
  className: string;
}

export function PerfLensLogo({ className }: PerfLensLogoProps) {
  return <img src={logoUrl} alt="PerfLens logo" className={className} />;
}
