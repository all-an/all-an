#include <stdio.h>

void adialog1(void);
void cdialog1(void);
void adialog2(void);
void cdialog2(void);
void adialog3(void);
void cdialog3(void);

int main()
{
	adialog1();
	cdialog1();
	adialog2();
	cdialog2();
	adialog3();
	cdialog3();

	return(0);
}

void cdialog1(void)
{
	puts("C: I'm a mid-level language");
}

void cdialog2(void)
{
	puts("C: I'm kinda fast");
}

void cdialog3(void)
{
	puts("C: My development cycle is good");
}
