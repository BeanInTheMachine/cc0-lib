import Link from "next/link";
import Container from "@/components/ui/container";
import { getSiteUrl } from "@/lib/site-url";

export const generateMetadata = async () => {
  const title = `Info | CC0-LIB`;
  const description = "What is CC0-LIB";
  const siteUrl = getSiteUrl();
  const image = `${siteUrl}/og.png`;
  const url = `${siteUrl}/info`;

  return {
    title: title,
    description: description,
    image: image,
    url: url,
    type: "website",
    openGraph: {
      title: title,
      description: description,
      url: url,
      type: "website",
      images: [
        {
          url: image,
          width: 800,
          height: 400,
          alt: title,
        },
      ],
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title: title,
      description: description,
      images: [image],
    },
  };
};

const InfoPage = () => {
  return (
    <Container>
      <div className="sm:masonry sm:masonry-sm lg:masonry-md 2xl:masonry-lg flex w-full flex-col gap-8 px-4 py-16 text-prim sm:block sm:gap-0 sm:space-y-16 sm:px-16 sm:py-16">
        <Card>
          <Title>wtf is this?</Title>
          <Description>
            library of cc0 content for you to refer/use/remix/do whatever with
            it
          </Description>
        </Card>

        <Card>
          <Title>what is cc0</Title>
          <Description>
            learn more about{" "}
            <Link
              href="https://creativecommons.org/publicdomain/zero/1.0"
              target="_blank"
              rel="noreferrer noopener"
              className="bg-zinc-800 text-prim underline hover:bg-prim hover:text-zinc-800"
            >
              creative commons zero
            </Link>
          </Description>
        </Card>

        <Card>
          <Title>resurrected</Title>
          <Description>
            by{" "}
            <Link
              href="https://farcaster.xyz/coolbeans1r.eth"
              target="_blank"
              rel="noreferrer noopener"
              className="bg-zinc-800 text-prim underline hover:bg-prim hover:text-zinc-800"
            >
              coolbeans1r.eth
            </Link>
          </Description>
        </Card>

        <Card>
          <Title>team</Title>
          <Description>
            the same team that brought you{" "}
            <Link
              href="https://archives.wtf"
              target="_blank"
              rel="noreferrer noopener"
              className="bg-zinc-800 text-prim underline hover:bg-prim hover:text-zinc-800"
            >
              archives.wtf
            </Link>{" "}(dead) -{" "}
            <Link
              href="https://twitter.com/thevoadz"
              target="_blank"
              rel="noreferrer noopener"
              className="bg-zinc-800 text-prim underline hover:bg-prim hover:text-zinc-800"
            >
              voadz
            </Link>{" "}
            and{" "}
            <Link
              href="https://twitter.com/0xNeroOne"
              target="_blank"
              rel="noreferrer noopener"
              className="bg-zinc-800 text-prim underline hover:bg-prim hover:text-zinc-800"
            >
              neroone
            </Link>
          </Description>
        </Card>

        <Card>
          <Title>leaderboard</Title>
          <Description>
            who&apos;s the greatest{" "}
            <Link
              href="/leaderboard"
              className="bg-zinc-800 text-prim underline hover:bg-prim hover:text-zinc-800"
            >
              contributor?
            </Link>
          </Description>
        </Card>

        <Card>
          <Title>contribute</Title>
          <Description>
            be a{" "}
            <Link
              href="/upload"
              className="bg-zinc-800 text-prim underline hover:bg-prim hover:text-zinc-800"
            >
              contributor
            </Link>
          </Description>
        </Card>

        <Card>
          <Title>sitemap</Title>
          <Description>
            <Link
              href="/sitemap"
              className="bg-zinc-800 text-prim underline hover:bg-prim hover:text-zinc-800"
            >
              explore
            </Link>
          </Description>
        </Card>

        <Card>
          <Title>fun mode</Title>
          <Description>
            browse{" "}
            <Link
              href="/random"
              className="bg-zinc-800 text-prim underline hover:bg-prim hover:text-zinc-800"
            >
              our content
            </Link>{" "}
            in interactive way!
          </Description>
        </Card>

        {/* <Card>
          <Title>intelligent search</Title>
          <Description>
            ai{" "}
            <Link
              href="/ai"
              className="bg-zinc-800 text-prim underline hover:bg-prim hover:text-zinc-800"
            >
              assisted search
            </Link>
          </Description>
        </Card> */}

        <Card>
          <Title>privacy policy</Title>
          <Description>
            read our{" "}
            <Link
              href="/privacy"
              className="bg-zinc-800 text-prim underline hover:bg-prim hover:text-zinc-800"
            >
              privacy policy
            </Link>
          </Description>
        </Card>

        <Card>
          <Title>ideas/request?</Title>
          <Description>
            submit your{" "}
            <Link
              target="_blank"
              href="https://farcaster.xyz/coolbeans1r.eth"
              className="bg-zinc-800 text-prim underline hover:bg-prim hover:text-zinc-800"
            >
              ideas
            </Link>
          </Description>
        </Card>

        <Card>
          <Title>disclaimer</Title>
          <Description>
            read our{" "}
            <Link
              href="/disclaimer"
              className="bg-zinc-800 text-prim underline hover:bg-prim hover:text-zinc-800"
            >
              disclaimer
            </Link>
          </Description>
        </Card>

        <Card>
          <Title>donation</Title>
          <Description>
            send burrito money to coolbeans1r.eth
          </Description>
        </Card>

        <Card>
          <Title>support us!</Title>
          <Description>
            don&apos;t support us!
          </Description>
        </Card>
      </div>
    </Container>
  );
};
export default InfoPage;

const Title = ({ children }) => (
  <span className="font-rubik text-4xl sm:text-4xl">{children}</span>
);

const Description = ({ children }) => (
  <span className="w-full max-w-prose text-lg text-white sm:w-1/2">
    {children}
  </span>
);

const Card = ({ children }) => (
  <div className="flex h-auto w-full break-inside-avoid flex-col gap-4 sm:ml-8">
    {children}
  </div>
);
