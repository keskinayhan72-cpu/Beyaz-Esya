import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = { title: "Beyaz Eşya Fırsat Motoru", description: "Alım-satım fırsatı analizi — Uşak depo" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>
        <header className="top">
          <div className="inner">
            <strong>Beyaz Eşya Fırsat Motoru</strong>
            <nav>
              <Link href="/">Panel</Link>
              <Link href="/urunler">Katalog</Link>
              <Link href="/firsatlar">Fırsatlar</Link>
              <Link href="/kaynaklar">Kaynaklar</Link>
              <Link href="/ayarlar">Maliyet ayarları</Link>
            </nav>
            <span className="env">Bağımsız test ortamı · otomatik satın alma yok</span>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
