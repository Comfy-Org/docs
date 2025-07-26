#!/usr/bin/env python3
"""
External Link Tracking Script

This script fetches content from ComfyUI_frontend and ComfyUI repositories,
extracts docs.comfy.org links, and validates them against the current documentation structure.
"""

import os
import re
import sys
import requests
from pathlib import Path
from urllib.parse import urlparse


class ExternalLinkTracker:
    def __init__(self):
        self.github_token = os.environ.get('GITHUB_TOKEN')
        self.docs_domain = 'docs.comfy.org'
        self.target_repos = [
            'Comfy-Org/ComfyUI_frontend',
            'comfyanonymous/ComfyUI',
            'Comfy-Org/embedded-docs',
            'Comfy-Org/workflow_templates',
            'Comfy-Org/desktop',
            'Comfy-Org/comfy-cli'
        ]
        self.docs_root = Path('.')
        self.broken_links = []
        self.changed_links = []
        
        # Debug info
        print(f"GitHub token available: {'Yes' if self.github_token else 'No'}")
        if self.github_token:
            print(f"Token length: {len(self.github_token)}")
            print(f"Token starts with: {self.github_token[:10]}...")
        
        # Check rate limits
        self.check_rate_limits()
    
    def check_rate_limits(self):
        """Check GitHub API rate limits"""
        try:
            headers = {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'ComfyUI-Docs-Link-Tracker',
                'X-GitHub-Api-Version': '2022-11-28'
            }
            if self.github_token:
                headers['Authorization'] = f'Bearer {self.github_token}'
            
            response = requests.get('https://api.github.com/rate_limit', headers=headers)
            if response.status_code == 200:
                data = response.json()
                core_limit = data['resources']['core']
                print(f"API Rate Limit - Remaining: {core_limit['remaining']}/{core_limit['limit']}")
                if core_limit['remaining'] < 10:
                    print("⚠️  WARNING: Very low rate limit remaining!")
            else:
                print(f"Failed to check rate limits: {response.status_code}")
                print(f"Response: {response.text[:500]}")
        except Exception as e:
            print(f"Error checking rate limits: {str(e)}")
        
    def get_github_api_headers(self):
        """Get headers for GitHub API requests"""
        headers = {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'ComfyUI-Docs-Link-Tracker',
            'X-GitHub-Api-Version': '2022-11-28'
        }
        if self.github_token:
            headers['Authorization'] = f'Bearer {self.github_token}'
        else:
            print("Warning: No GitHub token provided, using unauthenticated requests")
        return headers
    
    def fetch_repo_content(self, repo):
        """Fetch all files from a GitHub repository"""
        print(f"Fetching content from {repo}...")
        
        # Get the default branch
        repo_url = f"https://api.github.com/repos/{repo}"
        response = requests.get(repo_url, headers=self.get_github_api_headers())
        if response.status_code != 200:
            print(f"❌ Failed to get repo info for {repo}: {response.status_code}")
            if response.status_code == 403:
                print(f"  - This might be due to API rate limits or repository access permissions")
                print(f"  - Response: {response.text[:200]}")
            elif response.status_code == 404:
                print(f"  - Repository {repo} not found or not accessible")
            return None  # Return None to indicate failure
        
        default_branch = response.json().get('default_branch', 'main')
        
        # Get the tree recursively
        tree_url = f"https://api.github.com/repos/{repo}/git/trees/{default_branch}?recursive=1"
        response = requests.get(tree_url, headers=self.get_github_api_headers())
        
        if response.status_code != 200:
            print(f"❌ Failed to fetch tree for {repo}: {response.status_code}")
            if response.status_code == 403:
                print(f"  - API rate limit or permission issue")
            return None  # Return None to indicate failure
        
        files_content = []
        tree_data = response.json()
        
        for item in tree_data.get('tree', []):
            if item['type'] == 'blob':
                file_path = item['path']
                # Only process text files that might contain links
                if self.should_process_file(file_path):
                    content = self.fetch_file_content(repo, item['sha'])
                    if content:
                        files_content.append({
                            'path': file_path,
                            'content': content,
                            'repo': repo
                        })
        
        return files_content
    
    def should_process_file(self, file_path):
        """Check if file should be processed for links"""
        extensions = ['.js', '.jsx', '.ts', '.tsx', '.py', '.md', '.mdx', '.html', '.vue', '.svelte']
        return any(file_path.lower().endswith(ext) for ext in extensions)
    
    def fetch_file_content(self, repo, sha):
        """Fetch content of a specific file by SHA"""
        blob_url = f"https://api.github.com/repos/{repo}/git/blobs/{sha}"
        response = requests.get(blob_url, headers=self.get_github_api_headers())
        
        if response.status_code != 200:
            return None
        
        blob_data = response.json()
        if blob_data.get('encoding') == 'base64':
            import base64
            try:
                content = base64.b64decode(blob_data['content']).decode('utf-8')
                return content
            except UnicodeDecodeError:
                # Skip binary files
                return None
        
        return blob_data.get('content', '')
    
    def extract_docs_links(self, content):
        """Extract all docs.comfy.org links from content"""
        # Pattern to match docs.comfy.org URLs
        pattern = r'https?://(?:www\.)?docs\.comfy\.org[^\s\'"<>)]*'
        links = re.findall(pattern, content, re.IGNORECASE)
        
        # Clean up links (remove trailing punctuation, etc.)
        cleaned_links = []
        for link in links:
            # Remove trailing punctuation that's not part of the URL
            link = re.sub(r'[.,;:!?\'")\]}]+$', '', link)
            cleaned_links.append(link)
        
        return list(set(cleaned_links))
    
    def get_local_docs_structure(self):
        """Build a map of available documentation paths"""
        docs_paths = set()
        
        # Find all .md and .mdx files
        for file_path in self.docs_root.rglob('*.md'):
            if 'node_modules' in str(file_path):
                continue
            rel_path = file_path.relative_to(self.docs_root)
            docs_paths.add(str(rel_path))
        
        for file_path in self.docs_root.rglob('*.mdx'):
            if 'node_modules' in str(file_path):
                continue
            rel_path = file_path.relative_to(self.docs_root)
            docs_paths.add(str(rel_path))
        
        return docs_paths
    
    def validate_link(self, link, docs_paths):
        """Validate if a docs.comfy.org link exists in current documentation"""
        parsed = urlparse(link)
        path = parsed.path.lstrip('/')
        fragment = parsed.fragment
        
        if not path:
            return True, "Root path"
        
        # Check for exact path matches
        potential_files = [
            f"{path}.md",
            f"{path}.mdx",
            f"{path}/index.md",
            f"{path}/index.mdx"
        ]
        
        for potential_file in potential_files:
            if potential_file in docs_paths:
                if fragment:
                    # If there's a fragment, try to validate it exists in the file
                    return self.validate_fragment(potential_file, fragment)
                return True, f"Found at {potential_file}"
        
        # Check if it's a directory with content
        matching_files = [p for p in docs_paths if p.startswith(f"{path}/")]
        if matching_files:
            return True, f"Directory exists with {len(matching_files)} files"
        
        return False, f"Path not found: {path}"
    
    def normalize_fragment(self, text):
        """Convert text to URL fragment format following GitHub's anchor generation rules"""
        # Convert to lowercase
        fragment = text.lower()
        
        # Remove special characters except spaces, hyphens, and underscores
        fragment = re.sub(r'[^\w\s\-_]', '', fragment)
        
        # Replace spaces and underscores with hyphens
        fragment = re.sub(r'[\s_]+', '-', fragment)
        
        # Remove leading/trailing hyphens
        fragment = fragment.strip('-')
        
        return fragment
    
    def validate_fragment(self, file_path, fragment):
        """Validate if a fragment (anchor) exists in a markdown file"""
        try:
            full_path = self.docs_root / file_path
            if not full_path.exists():
                return False, f"File not found: {file_path}"
            
            with open(full_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Normalize the target fragment
            target_fragment = fragment.lower()
            
            # Check for markdown headers
            header_pattern = r'^#+\s+(.+)$'
            for match in re.finditer(header_pattern, content, re.MULTILINE):
                header_text = match.group(1).strip()
                
                # Generate the fragment using the same rules as GitHub/markdown processors
                generated_fragment = self.normalize_fragment(header_text)
                
                if generated_fragment == target_fragment:
                    return True, f"Fragment found in {file_path} (header: '{header_text}')"
            
            # Check for explicit anchor tags with id attribute
            anchor_patterns = [
                f'id="{fragment}"',
                f"id='{fragment}'",
                f'id="{fragment.lower()}"',
                f"id='{fragment.lower()}'"
            ]
            
            for pattern in anchor_patterns:
                if pattern in content:
                    return True, f"Anchor found in {file_path}"
            
            # Check for HTML anchor tags
            html_anchor_pattern = rf'<[^>]*id\s*=\s*["\']({re.escape(fragment)}|{re.escape(fragment.lower())})["\'][^>]*>'
            if re.search(html_anchor_pattern, content, re.IGNORECASE):
                return True, f"HTML anchor found in {file_path}"
            
            return False, f"Fragment '{fragment}' not found in {file_path}"
            
        except Exception as e:
            return False, f"Error validating fragment: {str(e)}"
    
    def process_repositories(self):
        """Process all target repositories and validate their links"""
        print("Starting external link tracking...")
        
        docs_paths = self.get_local_docs_structure()
        print(f"Found {len(docs_paths)} documentation files")
        
        all_found_links = {}
        failed_repos = []
        
        for repo in self.target_repos:
            print(f"\nProcessing repository: {repo}")
            files_content = self.fetch_repo_content(repo)
            
            # Check if fetch failed
            if files_content is None:
                failed_repos.append(repo)
                continue
            
            repo_links = {}
            for file_info in files_content:
                links = self.extract_docs_links(file_info['content'])
                if links:
                    repo_links[file_info['path']] = links
            
            print(f"Found {sum(len(links) for links in repo_links.values())} docs.comfy.org links in {len(repo_links)} files")
            all_found_links[repo] = repo_links
        
        # Check if any repositories failed to fetch
        if failed_repos:
            error_msg = f"Failed to fetch content from repositories: {', '.join(failed_repos)}"
            print(f"\n❌ ERROR: {error_msg}")
            
            # Write error report
            with open('/tmp/external-link-report.txt', 'w') as f:
                f.write(f"## ❌ Repository Access Failed\n\n")
                f.write(f"Unable to fetch content from the following repositories:\n\n")
                for repo in failed_repos:
                    f.write(f"- `{repo}`\n")
                f.write(f"\n**Possible causes:**\n")
                f.write(f"- GitHub API rate limits exceeded\n")
                f.write(f"- Insufficient token permissions\n")
                f.write(f"- Repository access restrictions\n")
                f.write(f"- Network connectivity issues\n\n")
                f.write(f"**Action required:** Please check the GitHub Action logs and resolve the access issues.\n")
            
            sys.exit(1)
        
        # Validate all found links
        self.validate_all_links(all_found_links, docs_paths)
        
        # Generate report
        self.generate_report(all_found_links)
    
    def validate_all_links(self, all_found_links, docs_paths):
        """Validate all found links"""
        print("\nValidating links...")
        
        unique_links = set()
        for repo_links in all_found_links.values():
            for file_links in repo_links.values():
                unique_links.update(file_links)
        
        print(f"Validating {len(unique_links)} unique links...")
        
        for link in unique_links:
            is_valid, reason = self.validate_link(link, docs_paths)
            if not is_valid:
                self.broken_links.append({
                    'link': link,
                    'reason': reason,
                    'found_in': []
                })
        
        # Add file information to broken links
        for broken in self.broken_links:
            for repo, repo_links in all_found_links.items():
                for file_path, file_links in repo_links.items():
                    if broken['link'] in file_links:
                        broken['found_in'].append(f"{repo}:{file_path}")
    
    def generate_report(self, all_found_links):
        """Generate a report of the link validation results"""
        report_lines = []
        
        if self.broken_links:
            report_lines.append("## ❌ Broken Links Found\n")
            report_lines.append("The following documentation links are referenced in external repositories but don't exist in the current documentation:\n")
            
            for broken in self.broken_links:
                report_lines.append(f"### `{broken['link']}`")
                report_lines.append(f"**Issue:** {broken['reason']}\n")
                report_lines.append("**Found in:**")
                for location in broken['found_in']:
                    repo, file_path = location.split(':', 1)
                    report_lines.append(f"- [{repo}] `{file_path}`")
                report_lines.append("")
            
            report_lines.append("---\n")
            report_lines.append("⚠️ **Important:** These links are hardcoded in external repositories. Breaking them may cause broken links in ComfyUI frontend or other products.\n")
            report_lines.append("**Recommended actions:**")
            report_lines.append("1. If you renamed or moved content, add redirects")
            report_lines.append("2. If you deleted content, consider the impact on external references")
            report_lines.append("3. Contact the relevant repository maintainers if links need to be updated")
        else:
            report_lines.append("## ✅ All External Links Valid\n")
            report_lines.append("All documentation links found in external repositories are valid and accessible.\n")
        
        # Summary
        total_links = 0
        total_files = 0
        for repo_links in all_found_links.values():
            total_files += len(repo_links)
            total_links += sum(len(links) for links in repo_links.values())
        
        report_lines.append("## 📊 Summary\n")
        report_lines.append(f"- **Repositories scanned:** {len(self.target_repos)}")
        report_lines.append(f"- **Files with docs links:** {total_files}")
        report_lines.append(f"- **Total docs.comfy.org links found:** {total_links}")
        report_lines.append(f"- **Unique links:** {len(set(link for repo_links in all_found_links.values() for file_links in repo_links.values() for link in file_links))}")
        report_lines.append(f"- **Broken links:** {len(self.broken_links)}")
        
        report = "\n".join(report_lines)
        
        # Write report to file for GitHub Actions
        with open('/tmp/external-link-report.txt', 'w') as f:
            f.write(report)
        
        print("\n" + "="*60)
        print("EXTERNAL LINK TRACKING REPORT")
        print("="*60)
        print(report)
        
        # Exit with error code if there are broken links
        if self.broken_links:
            sys.exit(1)


def main():
    tracker = ExternalLinkTracker()
    tracker.process_repositories()


if __name__ == "__main__":
    main()