declare module 'react-simple-maps' {
  import type { ComponentProps, ReactNode } from 'react';

  export interface GeographyStyle {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    outline?: string;
    animation?: string;
  }

  export interface GeographyProps {
    geography: unknown;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    style?: {
      default?: GeographyStyle;
      hover?: GeographyStyle;
      pressed?: GeographyStyle;
    };
    [key: string]: unknown;
  }

  export function Geography(props: GeographyProps): JSX.Element;

  export interface GeographiesProps {
    geography: string | object;
    children: (props: { geographies: { id: string | number; rsmKey: string; [k: string]: unknown }[] }) => ReactNode;
  }

  export function Geographies(props: GeographiesProps): JSX.Element;

  export interface ComposableMapProps {
    projection?: string;
    style?: React.CSSProperties;
    children?: ReactNode;
    [key: string]: unknown;
  }

  export function ComposableMap(props: ComposableMapProps): JSX.Element;
}
