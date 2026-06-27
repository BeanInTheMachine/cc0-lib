import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export { slugify, shuffle } from "./metadata";

export const getLikedItems = () => {
  if (typeof window === "undefined") return [];
  const localStorage = window.localStorage;
  const sentimentItems = Object.keys(localStorage).filter((key) => {
    return key.includes("sentiment");
  });

  const likedItems = sentimentItems
    .filter((key) => {
      const isLiked = JSON.parse(localStorage.getItem(key) as string);
      return isLiked === "like";
    })
    .map((key) => {
      const slug = key.replace("-sentiment", "");
      return slug;
    });

  return likedItems;
};

export const blobSize = (blob: { size: number }): string => {
  const kilobyte = 1024;
  const megabyte = kilobyte * 1024;
  const gigabyte = megabyte * 1024;
  const terabyte = gigabyte * 1024;

  let blobSize = "";
  if (blob.size < kilobyte) {
    blobSize = `${blob.size} bytes`;
  } else if (blob.size < megabyte) {
    blobSize = `${(blob.size / kilobyte).toFixed(2)} Kb`;
  } else if (blob.size < gigabyte) {
    blobSize = `${(blob.size / megabyte).toFixed(2)} Mb`;
  } else if (blob.size < terabyte) {
    blobSize = `${(blob.size / gigabyte).toFixed(2)} Gb`;
  } else {
    blobSize = `${(blob.size / terabyte).toFixed(2)} Tb`;
  }

  return blobSize;
};

