import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <MainContainer>{children}</MainContainer>
      </body>
    </html>
  );
}

type MainContainerProps = {
  children: React.ReactNode;
};

const MainContainer = ({ children }: MainContainerProps) => {
  return (
    <main
      className="flex min-h-screen flex-col items-center justify-between bg-zinc-900 bg-grid
        p-8 font-spline text-white selection:bg-zinc-800 selection:text-prim sm:p-12"
    >
      {children}
    </main>
  );
};
