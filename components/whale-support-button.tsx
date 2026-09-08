"use client";

import Image from 'next/image';

const BUY_ME_A_COFFEE_URL = 'https://buymeacoffee.com/whales_teatime';

export function WhaleSupportButton() {
  return (
    <a
      className="whale-support-button"
      href={BUY_ME_A_COFFEE_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="제작자는 배가 고파요. Buy Me a Coffee에서 후원하기"
    >
      <span className="whale-support-copy" aria-hidden="true">
        <strong>제작자는 배가 고파요</strong>
        <small>커피 한 잔 보태기 ☕</small>
      </span>
      <span className="whale-support-bubble" aria-hidden="true">와앙!</span>
      <span className="whale-support-mascot" aria-hidden="true">
        <span className="whale-support-progress">
          <span>배고파</span><span>배고파.</span><span>배고파..</span><span>배고파...</span>
        </span>
        <span className="whale-support-art-frame">
          <Image className="whale-support-image whale-support-image-rest" src="/whale/whale-hungry.webp" width={1536} height={1024} alt="" priority />
          <Image className="whale-support-image whale-support-image-open" src="/whale/whale-burger.webp" width={1536} height={1024} alt="" />
        </span>
      </span>
    </a>
  );
}
