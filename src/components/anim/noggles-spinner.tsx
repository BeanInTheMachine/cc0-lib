import { cn } from "@/lib/utils";

type NogglesSpinnerProps = {
  size?: number;
  className?: string;
};

const NogglesSpinner = ({ size = 48, className }: NogglesSpinnerProps) => {
  return (
    <img
      src="/noggles-spinner.svg"
      alt="Loading..."
      className={cn("animate-spin", className)}
      style={{ width: size, height: size }}
    />
  );
};

export default NogglesSpinner;
