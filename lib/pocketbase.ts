import PocketBase from "pocketbase";

const pbUrl = import.meta.env.VITE_POCKETBASE_URL;

const pb = pbUrl ? new PocketBase(pbUrl) : null;

// Avoid auto-cancel when components unmount quickly (React Fast Refresh)
if (pb) {
  pb.autoCancellation(false);
}

export { pb };
