# summernote-custom-image-handler
A plugin that extends the Summernote editor with custom image handling.
Automatically uploads images inserted in Summernote (encoded in BASE64) to the server,
replaces BASE64 codes with URLs, and deletes server images if removed from the editor.
Includes CSRF protection and handles various server responses.

Features:
- Automatically uploads images in BASE64 format to the server and replaces them with URLs.
- Stores image links in cookies to clean up deleted images if editing is canceled.
- Handles server responses for successful or partially successful image deletions.
- Ensures that only images remaining after editing are saved.

Usage:
- Include jQuery and Summernote in your project before this plugin.
- Initialize Summernote on the desired element as shown below:

   $('#postContent').summernote({
       // Your custom options here
 *   });

Requirements:
- jQuery
- Summernote
- Server endpoint for handling image upload and deletion.
