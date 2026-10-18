{
  description = "Linux development environment for the official 2008 SNA GDP report";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = { nixpkgs, ... }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      devShells = forAllSystems (system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        {
          default = pkgs.mkShell {
            packages = [ pkgs.uv pkgs.python315 pkgs.nodejs_24 ];

            UV_PYTHON = "${pkgs.python315}/bin/python3.15";
            UV_PYTHON_DOWNLOADS = "never";
            PYTHONPATH = "src";
            MPLBACKEND = "Agg";
            ASTRO_TELEMETRY_DISABLED = "1";

            # NumPy and Matplotlib wheels need these shared libraries on NixOS.
            shellHook = ''
              export PATH="$PWD/node_modules/.bin:$PATH"
              export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath [ pkgs.stdenv.cc.cc.lib pkgs.zlib ]}''${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
            '';
          };
        });
    };
}
