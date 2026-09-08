"use client";

import Image from 'next/image';
import { tr, useLanguage } from '@/lib/i18n';

const BUY_ME_A_COFFEE_URL = 'https://buymeacoffee.com/whales_teatime';

export function WhaleSupportButton() {
  const { language } = useLanguage();
  const label = tr(language, '고래밥 보태기', 'Feed the whale');
  return (
    <a
      className="whale-support-button"
      href={BUY_ME_A_COFFEE_URL}
      target="_blank"
      rel="noreferrer"
      aria-label={`${label}. Support on Buy Me a Coffee`}
    >
      <span className="whale-support-copy" aria-hidden="true">
        <strong>{label}</strong>
      </span>
      <span className="whale-support-mascot" aria-hidden="true">
        <span className="whale-support-art-frame">
          <Image className="whale-support-image whale-support-image-rest" src="/whale/whale-hungry-cutout.png" width={1346} height={659} alt="" priority />
          <Image className="whale-support-image whale-support-image-open" src="/whale/whale-burger-scene.png" width={1410} height={818} alt="" />
          <Image className="whale-support-burger-piece" src="/whale/whale-burger-piece.png" width={112} height={108} alt="" />
          <span className="whale-support-ellipsis-mask" />
        </span>
      </span>
    </a>
  );
}
