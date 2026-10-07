import { test, expect } from "@playwright/test";
for (const width of [375, 768, 1440])
  test(`public introduction at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        name: "Your books. A voice. A conversation.",
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/home-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("link", { name: "Plans", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "A plan for every reader." }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Plans", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    expect(errors).toEqual([]);
  });
test("auth setup states and protected routes are safe without credentials", async ({
  page,
}) => {
  await page.goto("/books/new");
  await expect(page).toHaveURL(/sign-in/);
  await expect(
    page.getByRole("heading", { name: "Sign-in is being prepared" }),
  ).toBeVisible();
  const result = await page.request.get(
    "/api/books/000000000000000000000000/processing",
  );
  expect([401, 503]).toContain(result.status());
});
test("keyboard users can skip navigation and reach the reading content", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: /Start your story/ }),
  ).toBeFocused();
});
