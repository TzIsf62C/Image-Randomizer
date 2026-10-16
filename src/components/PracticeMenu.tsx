import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MenuIcon } from './icons';

const MENU_ITEMS = [
  { label: 'Add Images', path: '/images/add' },
  { label: 'Manage Images', path: '/images' },
  { label: 'Configure Practice', path: '/practice/configure' },
  { label: 'Categories & Sets', path: '/library' },
  { label: 'Export Data', path: '/export' },
  { label: 'Settings', path: '/settings' }
];

export const PracticeMenu = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="practice-menu" ref={containerRef}>
      <button
        ref={buttonRef}
        className="icon-button"
        type="button"
        aria-label="Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}
      >
        <MenuIcon />
      </button>
      {open ? (
        <ul className="practice-menu-list" role="menu">
          {MENU_ITEMS.map((item) => (
            <li key={item.path} role="none">
              <button type="button" role="menuitem" onClick={() => navigate(item.path)}>
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};
