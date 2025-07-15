#!/usr/bin/env python3
"""
Link validation script for bilingual documentation.

This script validates links in a bilingual documentation project to ensure:
1. Chinese documents don't use English links
2. English documents don't use Chinese links  
3. English documents don't use Chinese images
4. Chinese documents can use English images (allowed)
"""

import os
import re
import sys
import glob
from pathlib import Path
from typing import List, Dict, Any, Tuple

# Configuration rules
RULES = {
    'ZH_CN_DIR': 'zh-CN',
    'ZH_SNIPPETS_DIR': 'snippets/zh',
    'ZH_IMAGES_DIR': 'images/zh',
    'COMMON_IMAGES_DIR': 'images'
}

# Error collector
errors = []
# Fixed files collector
fixed_files = []

def is_chinese_doc(file_path: str) -> bool:
    """Check if file is a Chinese document."""
    return (f"/{RULES['ZH_CN_DIR']}/" in file_path or 
            f"{RULES['ZH_SNIPPETS_DIR']}/" in file_path or
            file_path.startswith(RULES['ZH_CN_DIR']) or
            file_path.startswith(RULES['ZH_SNIPPETS_DIR']))

def is_english_doc(file_path: str) -> bool:
    """Check if file is an English document."""
    return not is_chinese_doc(file_path)

def is_chinese_link(link: str) -> bool:
    """Check if link points to Chinese content."""
    return (f"/{RULES['ZH_CN_DIR']}/" in link or 
            f"/{RULES['ZH_SNIPPETS_DIR']}/" in link or 
            f"/{RULES['ZH_IMAGES_DIR']}/" in link)

def is_english_link(link: str) -> bool:
    """Check if link points to English content."""
    return (not is_chinese_link(link) and 
            not link.startswith('http') and 
            not link.startswith('mailto:') and
            not link.startswith('#') and
            not link.startswith('./') and
            not link.startswith('../'))

def is_chinese_image(image_path: str) -> bool:
    """Check if image is in Chinese image directory."""
    return f"/{RULES['ZH_IMAGES_DIR']}/" in image_path

def extract_links(content: str, file_path: str) -> List[Dict[str, Any]]:
    """Extract links from file content."""
    links = []
    
    # Match markdown links [text](link)
    markdown_links = re.findall(r'\[([^\]]+)\]\(([^)]+)\)', content)
    for text, url in markdown_links:
        links.append({
            'type': 'markdown',
            'text': text,
            'url': url,
            'match': f'[{text}]({url})'
        })
    
    # Match HTML links <a href="...">
    html_links = re.findall(r'<a[^>]+href\s*=\s*["\']([^"\']+)["\'][^>]*>', content)
    for url in html_links:
        links.append({
            'type': 'html',
            'url': url,
            'match': f'href="{url}"'
        })
    
    # Match component href attributes (but not src attributes)
    component_hrefs = re.findall(r'href\s*=\s*["\']([^"\']+)["\']', content)
    for url in component_hrefs:
        links.append({
            'type': 'component',
            'url': url,
            'match': f'href="{url}"'
        })
    
    return links

def extract_images(content: str, file_path: str) -> List[Dict[str, Any]]:
    """Extract images from file content."""
    images = []
    
    # Match markdown images ![alt](src)
    markdown_images = re.findall(r'!\[([^\]]*)\]\(([^)]+)\)', content)
    for alt, src in markdown_images:
        images.append({
            'type': 'markdown',
            'alt': alt,
            'src': src,
            'match': f'![{alt}]({src})'
        })
    
    # Match HTML images <img src="...">
    html_images = re.findall(r'<img[^>]+src\s*=\s*["\']([^"\']+)["\'][^>]*>', content)
    for src in html_images:
        images.append({
            'type': 'html',
            'src': src,
            'match': f'src="{src}"'
        })
    
    # Match component src attributes (only for images, not links)
    component_srcs = re.findall(r'src\s*=\s*["\']([^"\']+)["\']', content)
    for src in component_srcs:
        images.append({
            'type': 'component',
            'src': src,
            'match': f'src="{src}"'
        })
    
    return images

def fix_mdx_extensions(file_path: str, content: str) -> Tuple[str, bool]:
    """Fix .mdx extensions in links and return modified content and whether changes were made."""
    original_content = content
    
    # Fix markdown links [text](link.mdx) -> [text](link)
    content = re.sub(r'\[([^\]]+)\]\(([^)]+)\.mdx\)', r'[\1](\2)', content)
    
    # Fix HTML links <a href="link.mdx"> -> <a href="link">
    content = re.sub(r'href\s*=\s*["\']([^"\']+)\.mdx["\']', r'href="\1"', content)
    
    # Fix component href attributes href="link.mdx" -> href="link"
    content = re.sub(r'href\s*=\s*["\']([^"\']+)\.mdx["\']', r'href="\1"', content)
    
    return content, content != original_content

def fix_missing_leading_slash(file_path: str, content: str) -> Tuple[str, bool]:
    """Fix links that should start with / but don't, and return modified content and whether changes were made."""
    original_content = content
    
    def should_add_slash(link: str) -> bool:
        """Check if a link should have a leading slash added."""
        # Skip if already starts with /, ./, ../, #, http, mailto, or is empty
        if (link.startswith('/') or link.startswith('./') or link.startswith('../') or 
            link.startswith('#') or link.startswith('http') or link.startswith('mailto:') or 
            not link.strip()):
            return False
        
        # Check if it looks like a documentation path (contains common doc patterns)
        doc_patterns = [
            'zh-CN/', 'tutorials/', 'built-in-nodes/', 'interface/', 'installation/', 
            'development/', 'custom-nodes/', 'troubleshooting/', 'registry/', 'specs/',
            'get_started/', 'changelog/', 'comfy-cli/', 'snippets/', 'community/'
        ]
        
        return any(link.startswith(pattern) for pattern in doc_patterns)
    
    # Fix markdown links [text](link) -> [text](/link) for internal links
    def fix_markdown_link(match):
        text = match.group(1)
        link = match.group(2)
        if should_add_slash(link):
            return f'[{text}](/{link})'
        return match.group(0)
    
    content = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', fix_markdown_link, content)
    
    # Fix HTML links <a href="link"> -> <a href="/link">
    def fix_html_link(match):
        quote = match.group(1)  # " or '
        link = match.group(2)
        if should_add_slash(link):
            return f'href={quote}/{link}{quote}'
        return match.group(0)
    
    content = re.sub(r'href\s*=\s*(["\'])([^"\']+)\1', fix_html_link, content)
    
    return content, content != original_content

def validate_file_links(file_path: str, content: str) -> None:
    """Validate links in a file."""
    links = extract_links(content, file_path)
    images = extract_images(content, file_path)
    
    # Create a set of image sources to exclude from link checking
    image_sources = {image['src'] for image in images}
    
    # Check link errors (excluding image sources)
    for link in links:
        # Skip if this link is actually an image source
        if link['url'] in image_sources:
            continue
        
        # Check for .mdx extension in links (should not be present)
        if link['url'].endswith('.mdx'):
            errors.append({
                'file': file_path,
                'type': 'link',
                'error': 'Link contains .mdx extension',
                'details': f'Link "{link["url"]}" should not end with .mdx extension',
                'match': link['match']
            })
            continue
            
        if is_chinese_doc(file_path):
            # Chinese documents should not use English links
            if is_english_link(link['url']):
                errors.append({
                    'file': file_path,
                    'type': 'link',
                    'error': 'Chinese document uses English link',
                    'details': f'Link "{link["url"]}" in Chinese document should not point to English content',
                    'match': link['match']
                })
        elif is_english_doc(file_path):
            # English documents should not use Chinese links
            if is_chinese_link(link['url']):
                errors.append({
                    'file': file_path,
                    'type': 'link',
                    'error': 'English document uses Chinese link',
                    'details': f'Link "{link["url"]}" in English document should not point to Chinese content',
                    'match': link['match']
                })
    
    # Check image errors
    for image in images:
        if is_english_doc(file_path):
            # English documents should not use Chinese images
            if is_chinese_image(image['src']):
                errors.append({
                    'file': file_path,
                    'type': 'image',
                    'error': 'English document uses Chinese image',
                    'details': f'Image "{image["src"]}" in English document should not point to Chinese image directory',
                    'match': image['match']
                })
        # Chinese documents can use English images - no validation needed for Chinese docs using English images

def main():
    """Main function to validate all documentation files."""
    try:
        # Find all .mdx and .md files
        files = []
        for pattern in ['**/*.mdx', '**/*.md']:
            files.extend(glob.glob(pattern, recursive=True))
        
        # Filter out unwanted directories
        files = [f for f in files if not any(exclude in f for exclude in [
            'node_modules/', '.git/', '.github/'
        ])]
        
        print(f"Found {len(files)} documentation files")
        
        # First pass: Fix .mdx extensions and missing leading slashes
        for file_path in files:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # Fix .mdx extensions
                fixed_content, mdx_fixed = fix_mdx_extensions(file_path, content)
                
                # Fix missing leading slashes
                fixed_content, slash_fixed = fix_missing_leading_slash(file_path, fixed_content)
                
                if mdx_fixed or slash_fixed:
                    # Write the fixed content back to the file
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(fixed_content)
                    fixed_files.append(file_path)
                    
                    fixes = []
                    if mdx_fixed:
                        fixes.append(".mdx extensions")
                    if slash_fixed:
                        fixes.append("missing leading slashes")
                    
                    print(f"Fixed {' and '.join(fixes)} in: {file_path}")
                    
            except Exception as e:
                print(f"Error processing file {file_path}: {e}")
        
        # Second pass: Validate links after fixes
        for file_path in files:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                validate_file_links(file_path, content)
            except Exception as e:
                print(f"Error reading file {file_path}: {e}")
        
        # Output results
        if fixed_files:
            print(f"\n✅ Fixed link issues in {len(fixed_files)} files:")
            for file in fixed_files:
                print(f"  - {file}")
        
        if errors:
            print(f"\nFound {len(errors)} remaining link errors:\n")
            
            error_report = []
            for error in errors:
                error_report.append(f"""❌ **{error['file']}**
   - **Error**: {error['error']}
   - **Problem**: {error['details']}
   - **Found in code**: 
     ```
     {error['match']}
     ```
""")
            
            report = '\n'.join(error_report)
            print(report)
            
            # Write errors to file for GitHub Action
            with open('/tmp/link-errors.txt', 'w', encoding='utf-8') as f:
                f.write(report)
            
            sys.exit(1)
        else:
            print('✅ All link validations passed!')
            
    except Exception as e:
        print(f'Error during validation: {e}')
        sys.exit(1)

if __name__ == '__main__':
    main()