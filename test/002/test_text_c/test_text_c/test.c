#include <stdlib.h>
#include <locale.h>

int main() {
	setlocale(LC_ALL, "Portuguese");
	printf("Ol� Mund�o !");
	return 0;
}