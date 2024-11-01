/**
 * Plugin Name: Custom Summernote Image Handler
 * Description: A plugin that extends the Summernote editor with custom image handling.
 *              Automatically uploads images inserted in Summernote (encoded in BASE64) to the server,
 *              replaces BASE64 codes with URLs, and deletes server images if removed from the editor.
 *              Includes CSRF protection and handles various server responses.
 *
 * Author: Alexej Bogačev (RAIN WOLF s.r.o.)
 * Version: 1.1.0
 * License: MIT
 *
 * Features:
 * - Automatically uploads images in BASE64 format to the server and replaces them with URLs.
 * - Stores image links in cookies to clean up deleted images if editing is canceled.
 * - Handles server responses for successful or partially successful image deletions.
 * - Ensures that only images remaining after editing are saved.
 *
 * Usage:
 * - Include jQuery and Summernote in your project before this plugin.
 * - Initialize Summernote on the desired element as shown below:
 *
 *   $('#postContent').summernote({
 *       // Your custom options here
 *   });
 *
 * Requirements:
 * - jQuery
 * - Summernote
 * - Server endpoint for handling image upload and deletion.
 *
 * Example:
 * See the specific callbacks within the plugin for configuration details and customization.
 */



$(function () {

    let uploadedImages = {}; // Stores images uploaded to the editor with unique indexes
    let imagesUrlsStart = []; // Holds image links present at the start of editing
    let imagesUrlsFinal = []; // Holds image links present at the end of editing

    // summernote init
    $('#postContent').summernote({
        placeholder: 'Write here...',
        tabsize: 2,
        height: 500,
        toolbar: [
            ['style', ['style']],
            ['font', ['bold', 'underline', 'clear', 'fontname', 'fontsize']],
            ['color', ['color']],
            ['para', ['ul', 'ol', 'paragraph', 'height']],
            ['table', ['table']],
            ['insert', ['link', 'picture', 'video']],
            ['view', ['codeview', 'help', 'undo']]
        ],
        callbacks: {
            onImageUpload: function (files) {

                // Assign a unique index for each uploaded image and store it in uploadedImages
                 let imageIndex = 'img_' + Date.now();
                 uploadedImages[imageIndex] = files[0];

                // Convert the image file to BASE64 and insert it into the editor with a data-index attribute
                const reader = new FileReader();
                reader.onload = function (e) {
                    $('#postContent').summernote('insertImage', e.target.result, function ($image) {
                        //$image.attr('data-filename', files[0].name);
                        $image.attr('data-index', imageIndex);
                    });
                }
                reader.readAsDataURL(files[0]);
            },

            onInit: function (){
                // Get all images with links from the editor at the start of editing
                let imagesWithUrlsStart = getImages(true);
                imagesUrlsStart = getImagesUrls(imagesWithUrlsStart);

                // If any links were previously deleted, remove them from the editor
                if(imagesUrlsStart.length > 0){
                    let earlyDeletedImagesUrls = getUrlsFromCookies();
                    removeDeletedImagesUrls(imagesUrlsStart, earlyDeletedImagesUrls);
                    imagesUrlsStart = getImagesUrls(imagesWithUrlsStart);
                }
            },
        }

    });




    $('form').on('submit', async function (e) {
        e.preventDefault();

        // Check if there are images to upload
        if (Object.keys(uploadedImages).length > 0) {
            let dataImages = getImages(); // Get all BASE64 images from the editor at the end of editing after the form submission
            let dataImagesIndexes = getImagesIndexes(dataImages); // Create an array of indexes for remaining BASE64 images after editing
            let uploadedImagesForSave = filterImagesFiles(uploadedImages, dataImagesIndexes); // Filter images to keep only relevant ones that remain after editing

            // Check if there are images to upload after editing
            if (Object.keys(uploadedImagesForSave).length > 0) {
                let newImagesUrls = await saveImages(uploadedImagesForSave); // Upload images to the server
                if(!newImagesUrls || !validateSaveImagesResponse(newImagesUrls, uploadedImagesForSave)){
                    return; // Stop if upload failed or response is invalid
                }
                insertImagesUrls(dataImages, newImagesUrls); // Insert URLs into the editor for uploaded images, replacing BASE64 codes
            }
        }

        // Check if there were images with links at the start of editing
        if(imagesUrlsStart.length > 0){
            let imagesWithUrlsFinal = getImages(true); // Get images with links from the editor
            imagesUrlsFinal = getImagesUrls(imagesWithUrlsFinal); // Create an array of current image links

            // Identify images to delete: compare current links with links from the start of editing and create an array of removed links
            let imagesUrlsToDelete = getImagesLinksToDelete(imagesUrlsStart, imagesUrlsFinal);
            if(imagesUrlsToDelete.length > 0) {

                let result = await deleteImages(imagesUrlsToDelete); // Delete images from the server

                if(!result){
                    return; // Stop if deletion failed
                }

                if(!result.success){
                    alert('Not all images were successfully deleted from the server. Please contact support.\n')
                }else{
                    setUrlsInCookies(imagesUrlsToDelete); // Save links in cookies for later use upon initializing the editor
                }
            }
        }

        // Force update editor content to ensure all changes are saved
        const editorContent = $('#postContent').summernote('code');
        $('#postContent').summernote('code', editorContent);

        this.submit(); // Submit the form after all async operations

    });


    /**
     * Retrieves images from the editor.
     * @param {boolean} links - If true, retrieves images with URL links; otherwise, retrieves images in BASE64 format.
     * @returns {jQuery} - A jQuery object containing the selected images.
     */
    function getImages(links = false){
        if (links){
            return $('#postContent').next('div').find('img').not("[src*='data:image']");
        }else {
            return $('#postContent').next('div').find("img[src*='data:image']");
        }
    }

    /**
     * Filters uploaded images, keeping only images with indexes in the specified array.
     * @param {Object} uploadedImages - The original object of uploaded images.
     * @param {Array} imagesIndexes - Array of image indexes to keep.
     * @returns {Object} - Filtered object of images with only relevant indexes.
     */
    function filterImagesFiles(uploadedImages, imagesIndexes) {
        for (let key in uploadedImages) {
            if(!imagesIndexes.includes(key)){
                delete uploadedImages[key];
            }
        }
        return uploadedImages;
    }

    /**
     * Creates an array of data indexes for each image.
     * @param {jQuery} images - A jQuery object containing images.
     * @returns {Array} - Array of image indexes.
     */
    function getImagesIndexes(images) {
        let imagesIndexes = [];
        Object.values(images).forEach(function (file) {
            let $file = $(file);
            let imageIndex = $file.attr('data-index');
            if (imageIndex) {
                imagesIndexes.push(imageIndex);
            }

        })
        return imagesIndexes;
    }


    /**
     * Creates an array of image URLs from the images.
     * @param {jQuery} images - A jQuery object containing images.
     * @returns {Array} - Array of image URLs.
     */
    function getImagesUrls(images) {
        let imagesUrls = [];
        Object.values(images).forEach(function (file) {
            if(file instanceof HTMLImageElement){
                let $file = $(file);
                let imageUrl = $file.attr('src');
                if(imageUrl){
                    imagesUrls.push(imageUrl);
                }
            }
        })
        return imagesUrls;
    }

    /**
     * Compares initial and final image links, identifying links to delete.
     * @param {Array} imagesUrlsStart - Array of initial image links.
     * @param {Array} imagesUrlsFinal - Array of final image links.
     * @returns {Array} - Array of links to be deleted.
     */
    function getImagesLinksToDelete(imagesUrlsStart, imagesUrlsFinal){
        let imagesUrlsToDelete = [];
        imagesUrlsStart.forEach(function (value){
            if(!imagesUrlsFinal.includes(value)){
                imagesUrlsToDelete.push(value);
            }
        })
        return imagesUrlsToDelete;
    }

    /**
     * Retrieves the CSRF token from the form.
     * @returns {string|null} - The CSRF token or null if not found.
     */
    function getCSRFToken(){
        return $("input[name=token]").val() ?? null;
    }

    /**
     * Replaces BASE64 image sources in the editor with server-provided URLs.
     * @param {jQuery} images - A jQuery object containing images in the editor.
     * @param {Object} imagesUrls - Object mapping image indexes to URLs.
     */
    function insertImagesUrls(images, imagesUrls){
        Object.values(images).forEach(function (file) {
            if(file instanceof HTMLImageElement){
                let $file = $(file);
                let imageIndex = $file.data('index');
                $file.attr('src', imagesUrls[imageIndex]);
            }
        })
    }

    /**
     * Asynchronously uploads images to the server and handles the response.
     *
     * This function sends images to the server using AJAX with FormData.
     * Each image in the `images` object is appended to the FormData along with a CSRF token.
     * On successful upload, the server is expected to return a JSON response containing URLs
     * corresponding to each image key.
     *
     * @param {Object} images - An object containing images to be uploaded.
     *                          The keys represent unique identifiers, and the values are the image files.
     *
     * @returns {Promise} - Resolves to the parsed server response if successful, or `false` if an error occurs.
     *
     * Server Requirements:
     * 1. Endpoint: The server should have an accessible endpoint at `'admin/posts/save-image'`
     *    to handle the image uploads.
     * 2. CSRF Token: The server should validate a CSRF token provided in the payload under the key `'token'`.
     * 3. Expected Response Format:
     *    - **Success:** On successful upload, the server should return a JSON object where each key
     *      corresponds to an image identifier from the `images` object. Each value should be a string
     *      URL pointing to the uploaded image, for example:
     *      ```json
     *      {
     *          "img_123456": "http://example.com/path/to/image1.jpg",
     *          "img_789012": "http://example.com/path/to/image2.jpg"
     *      }
     *      ```
     *    - **Error:** In case of a failure (e.g., CSRF validation fails or an unexpected error occurs),
     *      the server should return an HTTP error status (e.g., 403, 500) to trigger the `.fail` block.
     *      If applicable, the server can also send an error message in the response text for debugging purposes.
     *
     */
     function saveImages(images){
         return new Promise((resolve,reject)=> {
             let data = new FormData;
             for (const key in images) {
                 if (images.hasOwnProperty(key)) {
                     data.append(key, images[key]);
                 }
             }

             let token = getCSRFToken();
             data.append('token', token);

             $.ajax({
                 url: 'admin/posts/save-image',
                 method: 'POST',
                 data: data,
                 processData: false,
                 contentType: false
             })
             .done((response) => {
                 resolve(JSON.parse(response));
             })
             .fail((jqXHR, textStatus, errorThrown) => {
                 console.log('Save image error:');
                 console.log(`Status: ${jqXHR.status}`);           // HTTP status code
                 console.log(`Error Thrown: ${errorThrown}`);      // Brief description of the error
                 console.log(`Response Text: ${jqXHR.responseText}`); // Original server response
                 resolve(false);
             })
        })
    }



    /**
     * Asynchronously deletes images from the server and handles the response.
     *
     * This function sends a list of image links to the server via AJAX for deletion.
     * A CSRF token is included to ensure secure requests. The server is expected to
     * return a JSON response indicating whether all images were deleted successfully
     * or if some failed.
     *
     * @param {Array} imagesLinks - An array of strings representing image URLs to be deleted.
     *
     * @returns {Promise} - Resolves to the server's JSON response if successful.
     *                      If the AJAX request fails (e.g., network error or server error like 4xx, 5xx),
     *                      it resolves to `false`.
     *
     * Server Requirements:
     * 1. Endpoint: The server should have an accessible endpoint at `'admin/posts/delete-images'`
     *    to handle the deletion requests.
     * 2. CSRF Token: The server should validate a CSRF token provided in the payload under the key `'token'`.
     * 3. Expected Response Format:
     *    - **Success**: If all images are deleted, the server should return:
     *      ```json
     *      {
     *          "success": "true",
     *          "message": "All images were deleted."
     *      }
     *      ```
     *    - **Partial Success**: If only some images are deleted successfully, the server should return:
     *      ```json
     *      {
     *          "success": "false",
     *          "message": "Some images were not deleted."
     *      }
     *      ```
     *    - **Error Cases**: If the request fails due to CSRF validation or an unexpected server error,
     *      the server should return a status code indicating the error (e.g., 403 for CSRF failure)
     *      and an error message in the response.
     *
     */
    function deleteImages(imagesLinks){
        return new Promise((resolve,reject)=> {
            let links = imagesLinks;
            let token = getCSRFToken();

            $.ajax({
                url: 'admin/posts/delete-images',
                method: 'POST',
                data: {links, token},
                dataType: 'json'
            })
            .done((response) => {
                resolve(response);
            })
            .fail((jqXHR, textStatus, errorThrown) => {
                console.log('Save image error:');
                console.log(`Status: ${jqXHR.status}`);           // HTTP status code
                console.log(`Error Thrown: ${errorThrown}`);      // Brief description of the error
                console.log(`Response Text: ${jqXHR.responseText}`); // Original server response
                resolve(false);
            })
        })
    }

    /**
     * Stores an array of URLs in cookies with a 2-day expiration.
     * @param {Array} urls - Array of URLs to be saved in cookies.
     */
    function setUrlsInCookies(urls) {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 2); // Куки на 2 дня
        document.cookie = `deletedLinks=${JSON.stringify(urls)}; expires=${expiryDate.toUTCString()}; path=/`;
    }


    /**
     * Retrieves URLs from cookies, if available.
     * @returns {Array} - Array of URLs retrieved from the cookie, or an empty array if none are found.
     */
    function getUrlsFromCookies() {
        const cookie = document.cookie
            .split('; ')
            .find(row => row.startsWith('deletedLinks='));
        return cookie ? JSON.parse(cookie.split('=')[1]) : [];
    }

    /**
     * Removes images from the editor based on deleted URLs.
     * @param {Array} urlsFromContent - Array of URLs currently in the editor.
     * @param {Array} deletedUrls - Array of URLs to be removed from the editor.
     */
    function removeDeletedImagesUrls(urlsFromContent, deletedUrls){
        urlsFromContent.forEach(function(value){
            if(deletedUrls.includes(value)){
                $('#postContent').next('div').find("img[src='" + value + "']").remove();
            }
        })
    }

    /**
     * Validates the server response for the saveImages function.
     *
     * @param {Object} response - The parsed JSON response from the server.
     * @param {Object} images - The original images object containing the keys to check.
     * @returns {boolean} - True if the response contains the same keys as `images` with string values, false otherwise.
     */
    function validateSaveImagesResponse(response, images) {
        // Step 1: Check if the response is an object
        if (!response || typeof response !== 'object') {
            console.error("Invalid response format.");
            return false;
        }

        // Step 2: Get keys from the original images object
        const imageKeys = Object.keys(images);

        // Step 3: Ensure the response contains the same keys with string values
        for (let key of imageKeys) {
            if (!(key in response)) {
                console.error(`Missing key in response: ${key}`);
                return false;
            }
            if (typeof response[key] !== 'string') {
                console.error(`Invalid value type for key: ${key}. Expected a string.`);
                return false;
            }
        }

        // If all checks pass, return true
        return true;
    }


})