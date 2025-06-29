# Super Lunch Buddies

Super Lunch Buddies is a web application designed to help groups of friends or colleagues decide where to go for lunch. It eliminates the endless "I don't know, where do you want to go?" debate by providing a collaborative platform to manage restaurant choices, see who's going, and get AI-powered suggestions.

## Key Features

-   **Group Management:** Create and switch between different lunch groups (e.g., work, friends).
-   **Real-time Status:** See who's "in" for lunch in real-time and what they're suggesting.
-   **Collaborative Restaurant List:** Maintain a shared list of favorite restaurants with popularity ratings, visit history, and custom descriptions.
-   **AI-Powered Vibe Suggestions:** Can't decide? Describe the "vibe" (e.g., "cheap and cheerful," "something new and spicy") and let the Gemini-powered AI suggest the best spots from your list, plus a bonus wildcard suggestion for a new place to try nearby.
-   **AI-Generated Descriptions:** Automatically generate fun, punchy descriptions for restaurants when you add them.
-   **Search and Sort:** Easily find restaurants by searching or sorting by popularity or last visit date.
-   **Dark Mode:** Automatically adapts to your system's theme.

## Deployment

To deploy the application to Firebase Hosting, follow these steps from a WSL (Windows Subsystem for Linux) terminal.

1.  **Build the Application:**
    This command bundles the app into static files for deployment. Fix any errors or warnings that appear during the build process before proceeding.
    ```bash
    npm run build
    ```

2.  **Deploy to Firebase:**
    Use the Firebase CLI to deploy the `build` folder.
    ```bash
    firebase deploy
    ```

3.  **Verify:**
    After the deployment is complete, verify that the updates are live by visiting https://lunch.invisibits.com.
