import { redirect } from "next/navigation";
import { currentOwner } from "@/lib/auth";
import { voices } from "@/lib/voices";
import { UploadForm } from "@/components/upload-form";
export default async function NewBook() {
  if (!(await currentOwner())) redirect("/sign-in");
  const catalog = voices().map(({ id, name, description }) => ({
    id,
    name,
    description,
  }));
  return (
    <>
      <header className="page-header">
        <p className="eyebrow">MAKE ROOM FOR A NEW STORY</p>
        <h1>Add to your library.</h1>
        <p>
          Bring a book you’re curious about. We’ll give you a new way to explore
          it.
        </p>
      </header>
      {catalog.length ? (
        <UploadForm catalog={catalog} />
      ) : (
        <div className="setup-note">
          No verified voices are configured yet. Add the provider voice catalog
          before uploading.
        </div>
      )}
    </>
  );
}
