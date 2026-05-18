import type { JSX } from 'react';

import Archive from '../../assets/icons/archive.svg?react';
import Bell from '../../assets/icons/bell.svg?react';
import Check from '../../assets/icons/check.svg?react';
import ChevronDown from '../../assets/icons/chevron-down.svg?react';
import ChevronRight from '../../assets/icons/chevron-right.svg?react';
import Clock from '../../assets/icons/clock.svg?react';
import Crown from '../../assets/icons/crown.svg?react';
import Flag from '../../assets/icons/flag.svg?react';
import Heart from '../../assets/icons/heart.svg?react';
import LogOut from '../../assets/icons/log-out.svg?react';
import Mail from '../../assets/icons/mail.svg?react';
import MessageCircle from '../../assets/icons/message-circle.svg?react';
import More from '../../assets/icons/more-horizontal.svg?react';
import MoreVertical from '../../assets/icons/more-vertical.svg?react';
import Pencil from '../../assets/icons/pencil-line.svg?react';
import Plus from '../../assets/icons/plus.svg?react';
import PrayHands from '../../assets/icons/pray-hands.svg?react';
import Refresh from '../../assets/icons/refresh-cw.svg?react';
import Search from '../../assets/icons/search.svg?react';
import ShieldCheck from '../../assets/icons/shield-check.svg?react';
import SmilePlus from '../../assets/icons/smile-plus.svg?react';
import Sunrise from '../../assets/icons/sunrise.svg?react';
import UserAnon from '../../assets/icons/user-round-minus.svg?react';
import User from '../../assets/icons/user.svg?react';
import X from '../../assets/icons/x.svg?react';

const REGISTRY = {
  archive: Archive,
  bell: Bell,
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  clock: Clock,
  crown: Crown,
  flag: Flag,
  heart: Heart,
  'log-out': LogOut,
  mail: Mail,
  message: MessageCircle,
  more: More,
  'more-vertical': MoreVertical,
  pen: Pencil,
  plus: Plus,
  pray: PrayHands,
  refresh: Refresh,
  search: Search,
  shield: ShieldCheck,
  'smile-plus': SmilePlus,
  sunrise: Sunrise,
  user: User,
  'user-anon': UserAnon,
  x: X,
} as const;

export type IconName = keyof typeof REGISTRY;

export interface IconProps {
  name: IconName;
  size?: 14 | 16 | 18 | 20 | 24 | 32 | 48;
  className?: string;
  'aria-hidden'?: boolean;
}

export function Icon({
  name,
  size = 18,
  className,
  'aria-hidden': ariaHidden = true,
}: IconProps): JSX.Element {
  const Svg = REGISTRY[name];
  return (
    <Svg
      width={size}
      height={size}
      strokeWidth={1.5}
      className={className}
      aria-hidden={ariaHidden}
      focusable="false"
    />
  );
}
