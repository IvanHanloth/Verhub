-- Documentation entry point for a project, shown as an action on the public
-- showcase page. Nullable because most projects have no docs site.
ALTER TABLE "Project" ADD COLUMN "docsUrl" TEXT;
