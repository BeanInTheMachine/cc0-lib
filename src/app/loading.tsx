import NogglesSpinner from "@/components/anim/noggles-spinner";
import Container from "@/components/ui/container";

const LoadingPage = () => {
  return (
    <Container>
      <div className="flex h-96 w-full items-center justify-center">
        <NogglesSpinner size={64} />
      </div>
    </Container>
  );
};
export default LoadingPage;
