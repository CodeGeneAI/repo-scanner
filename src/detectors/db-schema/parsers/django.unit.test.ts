import { describe, expect, it } from "bun:test";
import { parseDjango } from "./django";

describe("Django models parser", () => {
  it("extracts a simple model with fields", () => {
    const code = `
from django.db import models

class User(models.Model):
    name = models.CharField(max_length=255)
    email = models.EmailField()
    age = models.IntegerField()
`;
    const result = parseDjango(code, "app/models.py");
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0]!.name).toBe("user");
    expect(result.tables[0]!.columns).toHaveLength(3);
    expect(result.tables[0]!.columns[0]!.name).toBe("name");
    expect(result.tables[0]!.columns[0]!.type).toBe("varchar");
    expect(result.tables[0]!.columns[1]!.name).toBe("email");
    expect(result.tables[0]!.columns[1]!.type).toBe("varchar");
    expect(result.tables[0]!.columns[2]!.name).toBe("age");
    expect(result.tables[0]!.columns[2]!.type).toBe("integer");
  });

  it("detects ForeignKey relationships", () => {
    const code = `
from django.db import models

class Post(models.Model):
    title = models.CharField(max_length=200)
    author = models.ForeignKey("User", on_delete=models.CASCADE)
`;
    const result = parseDjango(code, "app/models.py");
    expect(result.tables[0]!.columns).toHaveLength(2);
    const authorCol = result.tables[0]!.columns.find(
      (c) => c.name === "author_id",
    )!;
    expect(authorCol.isForeignKey).toBe(true);
    expect(authorCol.references).toEqual({ table: "user", column: "id" });
    expect(result.relationships).toHaveLength(1);
    expect(result.relationships[0]!.type).toBe("one-to-many");
  });

  it("detects ManyToManyField relationships", () => {
    const code = `
from django.db import models

class Post(models.Model):
    title = models.CharField(max_length=200)
    tags = models.ManyToManyField("Tag")
`;
    const result = parseDjango(code, "app/models.py");
    expect(result.relationships).toHaveLength(1);
    expect(result.relationships[0]!.type).toBe("many-to-many");
  });

  it("detects OneToOneField relationships", () => {
    const code = `
from django.db import models

class UserProfile(models.Model):
    user = models.OneToOneField("User", on_delete=models.CASCADE)
    bio = models.TextField()
`;
    const result = parseDjango(code, "app/models.py");
    expect(result.relationships).toHaveLength(1);
    expect(result.relationships[0]!.type).toBe("one-to-one");
  });

  it("detects nullable OneToOneField", () => {
    const code = `
from django.db import models

class UserProfile(models.Model):
    user = models.OneToOneField(User, null=True)
`;
    const result = parseDjango(code, "app/models.py");
    const col = result.tables[0]!.columns.find((c) => c.name === "user_id")!;
    expect(col.nullable).toBe(true);
  });

  it("uses class Meta db_table for table name", () => {
    const code = `
from django.db import models

class UserProfile(models.Model):
    name = models.CharField(max_length=100)

    class Meta:
        db_table = "custom_profiles"
`;
    const result = parseDjango(code, "app/models.py");
    expect(result.tables[0]!.name).toBe("custom_profiles");
  });

  it("detects nullable fields (null=True)", () => {
    const code = `
from django.db import models

class User(models.Model):
    name = models.CharField(max_length=100)
    bio = models.TextField(null=True)
`;
    const result = parseDjango(code, "app/models.py");
    expect(result.tables[0]!.columns[0]!.nullable).toBe(false);
    expect(result.tables[0]!.columns[1]!.nullable).toBe(true);
  });

  it("detects default values", () => {
    const code = `
from django.db import models

class User(models.Model):
    active = models.BooleanField(default=True)
    role = models.CharField(max_length=50, default="user")
`;
    const result = parseDjango(code, "app/models.py");
    expect(result.tables[0]!.columns[0]!.defaultValue).toBe("True");
    expect(result.tables[0]!.columns[1]!.defaultValue).toBe('"user"');
  });

  it("detects AutoField as primary key", () => {
    const code = `
from django.db import models

class User(models.Model):
    id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=100)
`;
    const result = parseDjango(code, "app/models.py");
    expect(result.tables[0]!.columns[0]!.isPrimaryKey).toBe(true);
    expect(result.tables[0]!.primaryKey).toEqual(["id"]);
  });

  it("records source info correctly", () => {
    const code = `
from django.db import models

class User(models.Model):
    name = models.CharField(max_length=100)
`;
    const result = parseDjango(code, "myapp/models.py");
    expect(result.tables[0]!.source.file).toBe("myapp/models.py");
    expect(result.tables[0]!.source.parser).toBe("django");
    expect(result.tables[0]!.source.confidence).toBe(0.9);
  });

  it("returns empty result for empty input", () => {
    const result = parseDjango("", "models.py");
    expect(result.tables).toHaveLength(0);
    expect(result.relationships).toHaveLength(0);
  });

  it("returns empty result for non-model Python", () => {
    const result = parseDjango(
      `from django.http import HttpResponse\n\ndef index(request):\n    return HttpResponse("hello")`,
      "views.py",
    );
    expect(result.tables).toHaveLength(0);
  });
});
