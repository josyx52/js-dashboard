import "./globals.css";

export const metadata = {
  title: "JS",
  description: "Sistema pessoal de produtividade — JS",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <body>{children}</body>
    </html>
  );
}


