import "./globals.css";
export const metadata = {
  title: "CK Recycle • รับสินค้า",
  description: "ระบบรับสินค้า CK Recycle",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
