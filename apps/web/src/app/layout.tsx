import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

/*
  Two typefaces, self-hosted through next/font so nothing loads from a
  third party at runtime and a visitor's request never leaves the site.

  Inter for everything read at length. Fraunces, a serif with real
  optical sizing, for the few lines that carry the argument. A page about
  the body should not look like a dashboard, and one warm display face
  is most of the difference.
*/
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz", "SOFT"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Earshot",
  description:
    "You passed the hearing test and you still can't hear the television. A speech-in-noise check on the device where you noticed the problem.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

/*
  Applies a stored theme before the first paint, so there is no flash
  from light to dark for somebody who chose dark. It is deliberately the
  only script that runs before hydration and it touches one attribute.
*/
const themeScript = `(function(){try{var t=localStorage.getItem("earshot-theme");if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${fraunces.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
