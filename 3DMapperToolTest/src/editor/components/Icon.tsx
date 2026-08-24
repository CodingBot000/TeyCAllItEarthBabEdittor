import type { SVGProps } from 'react';

type IconName = 'cube' | 'save' | 'export' | 'folder' | 'copy' | 'trash' | 'filter' | 'settings' | 'cursor' | 'move' | 'rotate' | 'frame' | 'camera' | 'grid' | 'chevron' | 'undo' | 'redo' | 'upload' | 'mesh' | 'package';

export function Icon({ name, size = 18, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const paths: Record<IconName, React.ReactNode> = {
    cube: <><path {...common} d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path {...common} d="m4.4 7.7 7.6 4.5 7.6-4.5M12 12.2V21" /></>,
    save: <><path {...common} d="M4 4h13l3 3v13H4z" /><path {...common} d="M8 4v6h8V4M8 20v-5h8v5" /></>,
    export: <><path {...common} d="M12 3v12M7 8l5-5 5 5M5 14v5h14v-5" /></>,
    folder: <><path {...common} d="M3 6h7l2 2h9v10H3z" /></>,
    copy: <><rect {...common} x="8" y="8" width="11" height="11" rx="1" /><path {...common} d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></>,
    trash: <><path {...common} d="M4 7h16M9 11v5M15 11v5M6 7l1 13h10l1-13M9 4h6l1 3H8z" /></>,
    filter: <><path {...common} d="M4 5h16l-6 7v5l-4 2v-7z" /></>,
    settings: <><circle {...common} cx="12" cy="12" r="3" /><path {...common} d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.1h-2.6V20a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1A1.7 1.7 0 0 0 8 15a1.7 1.7 0 0 0-1.6-1H6v-2.6h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.1h2.6v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1V14h-.1a1.7 1.7 0 0 0-1.6 1Z" /></>,
    cursor: <><path {...common} d="m5 3 3.2 16 3.2-6.1 6.1-3.2L5 3Z" /><path {...common} d="m12 13 4 4" /></>,
    move: <><path {...common} d="M12 3v18M3 12h18M12 3l-2 2M12 3l2 2M12 21l-2-2M12 21l2-2M3 12l2-2M3 12l2 2M21 12l-2-2M21 12l-2 2" /></>,
    rotate: <><path {...common} d="M5 8a8 8 0 1 1-1 6" /><path {...common} d="M5 3v5h5" /></>,
    frame: <><path {...common} d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /></>,
    camera: <><path {...common} d="M4 7h4l1.3-2h5.4L16 7h4v12H4z" /><circle {...common} cx="12" cy="13" r="3.5" /></>,
    grid: <><path {...common} d="M4 4h16v16H4zM4 10h16M4 16h16M10 4v16M16 4v16" /></>,
    chevron: <path {...common} d="m7 9 5 5 5-5" />,
    undo: <><path {...common} d="M9 8 4 12l5 4" /><path {...common} d="M4 12h9a6 6 0 0 1 6 6" /></>,
    redo: <><path {...common} d="m15 8 5 4-5 4" /><path {...common} d="M20 12h-9a6 6 0 0 0-6 6" /></>,
    upload: <><path {...common} d="M12 16V4M7 9l5-5 5 5" /><path {...common} d="M4 15v5h16v-5" /></>,
    mesh: <><path {...common} d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path {...common} d="m4.4 7.7 7.6 4.5 7.6-4.5M12 12.2V21" /></>,
    package: <><path {...common} d="m4 7 8-4 8 4-8 4-8-4Z" /><path {...common} d="M4 7v10l8 4 8-4V7M12 11v10" /><path {...common} d="m8 5 8 4" /></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" {...props}>{paths[name]}</svg>;
}
