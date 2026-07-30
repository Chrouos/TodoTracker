'use client';

import { EXTENSION_ID } from '@/lib/bridge';
import { useStore } from '@/lib/store';

/** 擴充沒裝、沒開、或 ID 不符時的引導畫面。資料的家在擴充裡，所以連不上就什麼都做不了。 */
export default function Disconnected() {
  const { error, refresh } = useStore();

  return (
    <div className="notice">
      <h2><span className="mark">[!]</span> 沒有連上 TodoTracker 擴充</h2>
      <p className="cap">網頁沒有自己的資料庫 —— 資料存在擴充裡，網頁只是另一個介面。</p>
      <ol>
        <li>Chrome 開 <code>chrome://extensions</code>，確認 TodoTracker 是<strong>已啟用</strong>狀態</li>
        <li>擴充改過設定的話按一次<strong>重新載入</strong>（循環箭頭圖示）</li>
        <li>確認擴充 ID 是 <code>{EXTENSION_ID}</code></li>
        <li>網址必須是 <code>localhost</code> 或 <code>127.0.0.1</code>（擴充只信任這兩個來源）</li>
      </ol>
      <div className="actions">
        <button onClick={() => refresh()}>重新連線</button>
      </div>
      {error && <p className="cap" style={{ marginTop: 8 }}>錯誤代碼：{error}</p>}
    </div>
  );
}
